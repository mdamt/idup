'use strict';

/**
 * @file ActionMethod like restart, stop, monitor... are here
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project IDUP
 */

var cluster       = require('cluster');
var numCPUs       = require('os').cpus().length;
var pidusage         = require('pidusage');
var path          = require('path');
var util          = require('util');
var log           = require('debug')('idup:master');
var async         = require('async');
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var fs            = require('fs');
var os            = require('os');
var p             = path;
var Common        = require('../Common');
var cst           = require('../../constants.js');

module.exports = function(Master) {

  Master.getMonitorData = function(env, cb) {
    var processes = Master.getFormatedProcesses();
    var arr       = [];

    async.mapLimit(processes, cst.CONCURRENT_ACTIONS, function(pro, next) {
      if (pro.idup_env.status != cst.STOPPED_STATUS &&
          pro.idup_env.status != cst.ERRORED_STATUS) {
        pidusage.stat(pro.pid, function(err, res) {
          if (err)
            return next(err);

          pro['monit'] = res;
          return next(null, pro);
        });
      } else {
        pro['monit'] = {memory : 0, cpu : 0};
        return next(null, pro);;
      }
      return false;
    }, function(err, res) {
      if (err) return cb(new Error(err));
      return cb(null, res);
    });

  };

  Master.getSystemData = function(env, cb) {
    Master.getMonitorData(env, function(err, processes) {
      cb(err, {
        system: {
          hostname: os.hostname(),
          uptime: os.uptime(),
          cpus: os.cpus(),
          load: os.loadavg(),
          memory: {
            free: os.freemem(),
            total: os.totalmem()
          }
        },
        processes: processes
      });
    });
  };

  Master.ping = function(env, cb) {
    return cb(null, {msg : 'pong'});
  };

  Master.stopAll = function(env, cb) {
    var processes = Master.getFormatedProcesses();

    async.eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (proc.state == cst.STOPPED_STATUS) return next();

      return Master.stopProcessId(proc.idup_env.pm_id, next);
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, processes);
    });
  };

  /**
   * Start a stopped process by ID
   */

  Master.startProcessId = function(id, cb) {
    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});
    if (Master.clusters_db[id].idup_env.status == 'online')
      return cb(new Error({ msg : 'Process already online'}), {});
    return Master.executeApp(Master.clusters_db[id].idup_env, cb);
  };


  /**
   * Stop a process and set it on state 'stopped'
   */

  Master.stopProcessId = function(id, cb) {
    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});
    if (Master.clusters_db[id].idup_env.status == cst.STOPPED_STATUS)
      return cb(null, Master.getFormatedProcesses());

    var proc = Master.clusters_db[id];

    proc.idup_env.status = 'stopping';

    /**
     * Process to stop on cluster mode
     */
    if (proc.idup_env.exec_mode == 'cluster_mode' &&
        proc.state != 'disconnected' &&
        proc.state != 'dead') {

      proc.once('disconnect', function(){
        delete cluster.workers[proc.id];
        Master.killProcess(proc.process.pid, function() {
          return setTimeout(function() {
            cb(null, Master.getFormatedProcesses());
          }, 100);
        });
        return false;
      });
      try {
        proc.disconnect();
      } catch (e) {
        Master.killProcess(proc.process.pid, function() {
          return cb(null, Master.getFormatedProcesses());
        });
      }
    }
    else {
      /**
       * Process to stop on fork mode
       */
      Master.killProcess(proc.process.pid, function() {
        return cb(null, Master.getFormatedProcesses());
      });
      return false;
    }
    return false;
  };

  /**
   * Delete a process by id
   * It will stop it and remove it from the database
   */

  Master.deleteProcessId = function(id, cb) {
    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});

    Master.stopProcessId(id, function(err, dt) {
      delete Master.clusters_db[id];
      return cb(null, Master.getFormatedProcesses());
    });

    return false;
  };

  /**
   * Restart a process ID
   * If the process is online it will not put it on state stopped
   * but directly kill it and let Master restart it
   */

  Master.restartProcessId = function(id, cb) {
    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});
    var proc = Master.clusters_db[id];

    Master.resetState(proc.idup_env);

    if (proc.idup_env.status == cst.ONLINE_STATUS) {
      Master.killProcess(proc.process.pid, function() {
        return cb(null, Master.getFormatedProcesses());
      });
    }
    else
      Master.startProcessId(id, cb);
    return false;
  };

  /**
   * Restart all process by name
   */

  Master.restartProcessName = function(name, cb) {
    var processes = Master.findByName(name);

    async.eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (proc.idup_env.status == cst.ONLINE_STATUS)
        return Master.restartProcessId(proc.idup_env.pm_id, next);
      else
        return Master.startProcessId(proc.idup_env.pm_id, next);
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, Master.getFormatedProcesses());
    });
  };

  /**
   * Stop all process by name
   */

  Master.stopProcessName = function(name, cb) {
    var processes = Master.findByName(name);

    async.eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (proc.idup_env.status == cst.ONLINE_STATUS)
        return Master.stopProcessId(proc.idup_env.pm_id, next);
      return next();
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, Master.getFormatedProcesses());
    });
  };

  /**
   * Send system signal to process id
   * @param {integer} Id idup process id
   * @param {string} signal signal type
   */
  Master.sendSignalToProcessId = function(opts, cb) {
    var id = opts.process_id;
    var signal = opts.signal;

    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});
    var proc = Master.clusters_db[id];

    try {
      process.kill(Master.clusters_db[id].process.pid, signal);
    } catch(e) {
      console.error(e);
      return cb(new Error('Error when sending signal (signal unknown)'));
    }
    return cb(null, Master.getFormatedProcesses());
  };

  /**
   * Send system signal to all processes by name
   * @param {integer} name idup process name
   * @param {string} signal signal type
   */
  Master.sendSignalToProcessName = function(opts, cb) {
    var processes = Master.findByName(opts.process_name);
    var signal    = opts.signal;

    async.eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      if (proc.idup_env.status == cst.ONLINE_STATUS) {
        try {
          process.kill(proc.process.pid, signal);
        } catch(e) {
          return next(e);
        }
      }
      return setTimeout(next, 200);
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, Master.getFormatedProcesses());
    });

  };

  /**
   * Delete a process by name
   * It will stop it and remove it from the database
   */

  Master.deleteProcessName = function(name, cb) {
    var processes = Master.findByName(name);

    async.eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      Master.stopProcessId(proc.idup_env.pm_id, function() {
        delete Master.clusters_db[proc.idup_env.pm_id];
        return next();
      });
      return false;
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, Master.getFormatedProcesses());
    });
  };

  /**
   * Delete all processes
   * It will stop them and remove them from the database
   */

  Master.deleteAll = function(opts, cb) {
    var processes = Master.getFormatedProcesses();

    async.eachLimit(processes, cst.CONCURRENT_ACTIONS, function(proc, next) {
      Master.stopProcessId(proc.idup_env.pm_id, function() {
        delete Master.clusters_db[proc.idup_env.pm_id];
        return next();
      });
      return false;
    }, function(err) {
      if (err) return cb(new Error(err));

      Master.clusters_db = null;
      Master.clusters_db = {};
      return cb(null, processes);
    });
  };

  /**
   * Kill IDUP Daemon
   */

  Master.killMe = function(env, cb) {
    Master.deleteAll({}, function() {
      Master.bus.emit('idup:kill', {
        status : 'killed',
        msg : 'idup has been killed via method'
      });
      setTimeout(function() {
        cb(null, {msg : 'idup killed'});
        process.exit(cst.SUCCESS_EXIT);
      }, 500);
    });
  };

  /**
   * Send Message to Process by id or name
   */

  Master.msgProcess = function(opts, cb) {

    var msg = opts.msg || {};

    if ('id' in opts) {
      var id = opts.id;
      if (!(id in Master.clusters_db))
        return cb(new Error({msg : 'PM ID unknown'}), {});
      var proc = Master.clusters_db[id];

      if (proc.idup_env.status == cst.ONLINE_STATUS) {
        /*
         * Send message
         */
        proc.send(msg);
        return cb(null, 'message sent');
      }
      else
        return cb(new Error({msg : 'PM ID offline'}), {});
      return false;
    }

    else if ('name' in opts) {
      /*
       * As names are not unique in case of cluster, this
       * will send msg to all process matching  'name'
       */
      var name = opts.name;
      var arr = Object.keys(Master.clusters_db);
      var sent = 0;

      (function ex(arr) {
        if (arr[0] == null) return cb(null, 'sent ' + sent + ' messages');

        var id      = arr[0];
        var proc_env = Master.clusters_db[id].idup_env;

        if (p.basename(proc_env.pm_exec_path) == name || proc_env.name == name) {
          if (proc_env.status == cst.ONLINE_STATUS) {
            Master.clusters_db[id].send(msg);
            sent++;
            arr.shift();
            return ex(arr);

          }
        }
        else {
          arr.shift();
          return ex(arr);
        }
        return false;
      })(arr);
    }

    else return cb(new Error({msg : 'method requires name or id field'}), {});
    return false;
  };
};
