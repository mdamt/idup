'use strict';

/**
 * @file Reload functions related
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project IDUP
 */

var cluster       = require('cluster');
var numCPUs       = require('os').cpus().length;
var path          = require('path');
var util          = require('util');
var debug         = require('debug')('idup:master');
var async         = require('async');
var Common        = require('../Common');
var cst           = require('../../constants.js');

/**
 * softReload will wait permission from process to exit
 */
function softReload(Master, id, cb) {
  var t_key = 'todelete' + id;
  var timeout_1;
  var timeout_2;

  // Move old worker to tmp id
  Master.clusters_db[t_key] = Master.clusters_db[id];
  delete Master.clusters_db[id];

  var old_worker = Master.clusters_db[t_key];
  // Deep copy
  var new_env = JSON.parse(JSON.stringify(old_worker.idup_env));
  new_env.restart_time += 1;

  // Reset created_at and unstable_restarts
  Master.resetState(new_env);

  old_worker.idup_env.pm_id = t_key;

  Master.executeApp(new_env, function(err, new_worker) {
    if (err) return cb(err);

    timeout_1 = setTimeout(function() {
      return Master.deleteProcessId(t_key, cb);
    }, 8000);

    // Bind to know when the new process is up
    new_worker.once('listening', function() {
      clearTimeout(timeout_1);
      console.log('%s - id%d worker listening',
                  new_worker.idup_env.pm_exec_path,
                  new_worker.idup_env.pm_id);


      old_worker.once('disconnect', function() {
        clearTimeout(timeout_2);
        console.log('%s - id%s worker disconnect',
                    old_worker.idup_env.pm_exec_path,
                    old_worker.idup_env.pm_id);
        return Master.deleteProcessId(t_key, cb);
      });
      timeout_2 = setTimeout(function() {
        old_worker.disconnect();
      }, cst.GRACEFUL_TIMEOUT);
      old_worker.send('shutdown');
    });
    return false;
  });
  return false;
};

/**
 * hardReload will reload without waiting permission from process
 */
function hardReload(Master, id, cb) {
  var t_key = 'todelete' + id;
  var timer;
  // Move old worker to tmp id
  Master.clusters_db[t_key] = Master.clusters_db[id];
  delete Master.clusters_db[id];

  var old_worker = Master.clusters_db[t_key];
  // Deep copy
  var new_env = JSON.parse(JSON.stringify(old_worker.idup_env));
  new_env.restart_time += 1;

  // Reset created_at and unstable_restarts
  Master.resetState(new_env);

  old_worker.idup_env.pm_id = t_key;


  Master.executeApp(new_env, function(err, new_worker) {
    if (err) return cb(err);

    timer = setTimeout(function() {
      return Master.deleteProcessId(t_key, cb);
    }, 4000);

    // Bind to know when the new process is up
    new_worker.once('listening', function() {
      clearTimeout(timer);
      console.log('%s - id%d worker listening',
                  new_worker.idup_env.pm_exec_path,
                  new_worker.idup_env.pm_id);
      //old_worker.once('message', function(type) {
      old_worker.once('disconnect', function() {
        console.log('%s - id%s worker disconnect',
                    old_worker.idup_env.pm_exec_path,
                    old_worker.idup_env.pm_id);

        Master.deleteProcessId(t_key, cb);
      });
      old_worker.disconnect();
    });
    return false;
  });
  return false;
};

module.exports = function(Master) {

  Master.softReloadProcessId = function(id, cb) {
    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});
    if (Master.clusters_db[id].idup_env.status == cst.STOPPED_STATUS)
      return cb(null, Master.getFormatedProcesses());

    return softReload(Master, id, cb);
  };

  Master.reloadProcessId = function(id, cb) {
    if (!(id in Master.clusters_db))
      return cb(new Error({msg : 'PM ID unknown'}), {});
    if (Master.clusters_db[id].idup_env.status == cst.STOPPED_STATUS)
      return cb(null, Master.getFormatedProcesses());

    return hardReload(Master, id, cb);
  };

  Master.reload = function(env, cb) {
    var processes = Master.getFormatedProcesses();
    var l         = processes.length;

    async.eachLimit(processes, 1, function(proc, next) {
      if (proc.state == cst.STOPPED_STATUS || proc.idup_env.exec_mode != 'cluster_mode')
        return next();
      Master.reloadProcessId(proc.idup_env.pm_id, function() {
        return next();
      });
      return false;
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, {process_restarted : l});
    });
  };

  Master.reloadProcessName = function(name, cb) {
    var processes         = Master.findByName(name);
    var l                 = processes.length;

    async.eachLimit(processes, 1, function(proc, next) {
      if (proc.state == cst.STOPPED_STATUS || proc.idup_env.exec_mode != 'cluster_mode')
        return next();
      Master.reloadProcessId(proc.idup_env.pm_id, function() {
        return next();
      });
      return false;
    }, function(err) {
      if (err) return cb(new Error(err));
      return cb(null, {process_restarted : l});
    });
  };

};
