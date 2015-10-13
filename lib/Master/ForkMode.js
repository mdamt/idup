'use strict';

/**
 * @file Fork execution related functions
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project IDUP
 */

var cluster       = require('cluster');
var numCPUs       = require('os').cpus().length;
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

module.exports = function(master) {
  /**
   * For all apps - FORK MODE
   * fork the app
   */

  master.forkMode = function(idup_env, cb) {
    log('Entering in fork mode');
    var spawn = require('child_process').spawn;

    var interpreter = idup_env.exec_interpreter || 'node';

    var script = [idup_env.pm_exec_path];

    var out = fs.openSync(idup_env.pm_out_log_path, 'a');
    var err = fs.openSync(idup_env.pm_err_log_path, 'a');

    var pidFile = idup_env.pm_pid_path;

    // Concat args if present
    if (idup_env.args)
      script = script.concat(eval((idup_env.args)));

    var cspr = spawn(interpreter, script, {
      env      : idup_env,
      cwd      : idup_env.pm_cwd || process.cwd(),
      detached : true,
      stdio    : [ 'ignore', out, err ]
    });

    cspr.unref();
    fs.writeFileSync(pidFile, cspr.pid);

    cspr.once('close', function(status) {
      fs.close(out);
      fs.close(err);
      try {
        fs.unlinkSync(pidFile);
      }catch(e) {}
    });

    // Avoid circular dependency
    delete cspr._handle.owner;

    cspr.process = {};
    cspr.process.pid = cspr.pid;
    idup_env.status = cst.ONLINE_STATUS;

    if (cb) return cb(null, cspr);
    return false;
  };
};
