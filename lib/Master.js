'use strict';

/**
 * Module dependencies
 */

var cluster       = require('cluster');
var numCPUs       = require('os').cpus().length;
var usage         = require('usage');
var path          = require('path');
var util          = require('util');
var log           = require('debug')('idup:master');
var async         = require('async');
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var fs            = require('fs');
var os            = require('os');
var p             = path;
var Common        = require('./Common');
var cst           = require('../constants.js');
var Bridge        = require('./Bridge');
var CLI           = require('./CLI');

/**
 * Override cluster module configuration
 */

cluster.setupMaster({
  exec : p.resolve(p.dirname(module.filename), 'ProcessContainer.js')
});

/**
 * Expose Master
 */

var Master = module.exports = {
  next_id : 0,
  clusters_db : {},
  bus : new EventEmitter2({
    wildcard: true,
    delimiter: ':',
    newListener: false,
    maxListeners: 20
  })
};


/**
 * Populate Master namespace
 */
require('./Master/Methods.js')(Master);
require('./Master/ForkMode.js')(Master);
require('./Master/ClusterMode.js')(Master);
require('./Master/Reload')(Master);
require('./Master/ActionMethods')(Master);

/**
 * Forced entry to initialize cluster monitoring
 */

(function initEngine() {
  cluster.on('online', function(clu) {
    console.log('%s - id%d worker online', clu.idup_env.pm_exec_path, clu.idup_env.pm_id);
    clu.idup_env.status = cst.ONLINE_STATUS;
    Master.bus.emit('process:online', clu);
  });

  cluster.on('exit', function(clu, code, signal) {
    handleExit(clu, code);
  });
})();

/**
 * Handle logic when a process exit (Node or Fork)
 */
function handleExit(clu, exit_code) {
  console.log('Script %s %s exited code %d',
              clu.idup_env.pm_exec_path,
              clu.idup_env.pm_id,
              exit_code);

  var stopping    = (clu.idup_env.status == 'stopping' || clu.idup_env.status == cst.ERRORED_STATUS) ? true : false;
  var overlimit   = false;
  var pidFile     = [clu.idup_env.pm_pid_path, clu.idup_env.pm_id, '.pid'].join('');

  if (stopping)  clu.process.pid = 0;

  if (clu.idup_env.status != cst.ERRORED_STATUS)
    clu.idup_env.status = cst.STOPPED_STATUS;

  try {
    fs.unlinkSync(pidFile);
  }catch(e) {}

  /**
   * Avoid infinite reloop if an error is present
   */
  // If the process has been created less than 15seconds ago
  if ((Date.now() - clu.idup_env.created_at) < 15000) {
    // And if the process has an uptime less than a second
    if ((Date.now() - clu.idup_env.pm_uptime) < (1000 || clu.idup_env.min_uptime)) {
      // Increment unstable restart
      clu.idup_env.unstable_restarts += 1;
    }

    if (clu.idup_env.unstable_restarts >= 15) {
      // Too many unstable restart in less than 15 seconds
      // Set the process as 'ERRORED'
      // And stop to restart it
      clu.idup_env.status = cst.ERRORED_STATUS;
      console.error('Script %s had too many unstable restarts (%d). Stopped.',
                    clu.idup_env.pm_exec_path,
                    clu.idup_env.unstable_restarts);
      Master.bus.emit('process:exit:overlimit', clu);
      clu.idup_env.unstable_restarts = 0;
      clu.idup_env.created_at = null;
      overlimit = true;
    }
  }

  Master.bus.emit('process:exit', clu);

  if (!stopping)
    clu.idup_env.restart_time = clu.idup_env.restart_time + 1;

  if (!stopping && !overlimit) Master.executeApp(clu.idup_env);
};


/**
 * Launch the specified script (present in env)
 *
 * @param {Mixed} env
 * @param {Function} cb
 * @api private
 */

Master.executeApp = function(env, cb) {
  if (env['pm_id'] === undefined) {
    env['pm_id']             = Master.getNewId();
    env['restart_time']      = 0;
    env['unstable_restarts'] = 0;

    env.pm_out_log_path = env.pm_out_log_path.replace(/-[0-9]+\.log$|\.log$/g, '-' + env['pm_id'] + '.log');
    env.pm_err_log_path = env.pm_err_log_path.replace(/-[0-9]+\.log$|\.log$/g, '-' + env['pm_id'] + '.log');
  }

  if (!env.created_at)
    env['created_at']        = Date.now();

  env['pm_uptime']  = Date.now();
  env['status']     = 'launching';

  // Raw env copy
  var post_env = JSON.parse(JSON.stringify(env));

  util._extend(post_env, env.env);

  if (env['exec_mode'] == 'fork_mode') {
    // If fork mode enabled
    Master.forkMode(post_env, function(err, clu) {
      clu['idup_env']             = env;
      clu.idup_env.status         = cst.ONLINE_STATUS;
      Master.clusters_db[env.pm_id] = clu;

      clu.once('error', function(err) {
        console.log(err);
        clu.idup_env.status = cst.ERRORED_STATUS;
      });

      clu.once('close', function(code) {
        handleExit(clu, code);
      });

      Master.bus.emit('process:online', clu);
      if(cb) cb(null, clu);
      return false;
    });
  }
  else {
    // Code wrap enabled
    Master.nodeApp(post_env, function(err, clu) {
      if (err) return cb(err);
      clu['idup_env']             = env;
      clu.idup_env.status         = cst.ONLINE_STATUS;
      Master.clusters_db[env.pm_id] = clu;
      if (cb) cb(null, clu);
      return false;
    });
  }
  return false;
};

/**
 * First step before execution
 * Check if the -i parameter has been passed
 * so we execute the app multiple time
 *
 * @param {Mixed} env
 * @api public
 */
Master.prepare = function(env, cb) {
  // If instances option is set (-i [arg])
  if (env.instances) {
    if (env.instances == 'max') env.instances = numCPUs;
    env.instances = parseInt(env.instances);
    // multi fork depending on number of cpus
    var arr = [];

    (function ex(i) {
      if (i <= 0) {
        if (cb != null) return cb(null, arr);
        return false;
      }
      return Master.executeApp(JSON.parse(JSON.stringify(env)), function(err, clu) { // deep copy
        if (err) return ex(i - 1);
        arr.push(clu);
        return ex(i - 1);
      });
    })(env.instances);
  }
  else {
    return Master.executeApp(env, function(err, dt) {
      cb(err, dt);
    });
  }
  return false;
};

/**
 * Allows an app to be prepared using the same json format as the CLI, instead
 * of the internal IDUP format.
 * An array of applications is not currently supported. Call this method
 * multiple times with individual app objects if you have several to start.
 * @param app {Object}
 * @param [cwd] {string} Optional string to specify the cwd for the script.
 * @param cb {Function}
 * @returns {*}
 */
Master.prepareJson = function (app, cwd, cb) {
  if (!cb) {
    cb = cwd;
    cwd = undefined;
  }

  app = Common.resolveAppPaths(app, cwd);
  if (app instanceof Error)
    return cb(app);

  return Master.prepare(app, cb);
};

Master.connect = Bridge.start;
Master.startFile = CLI.startFile;
Master.restartProcessByName = CLI.restartProcessByName;
