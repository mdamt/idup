'use strict';

/**
 * @file Utilities for IDUP
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project IDUP
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
var Common        = require('../Common');
var cst           = require('../../constants.js');

module.exports = function(master) {

  /**
   *
   * Utility functions
   *
   */
  master.getProcesses = function() {
    return master.clusters_db;
  };

  master.getFormatedProcesses = function() {
    var db = master.clusters_db;
    var arr = [];

    for (var key in db) {
      if (db[key]) {
        arr.push({
          pid     : db[key].process.pid,
          name    : db[key].idup_env.name,
          idup_env : db[key].idup_env,
          pm_id   : db[key].idup_env.pm_id
        });
      }
    }
    return arr;
  };

  master.findProcessById = function(id) {
    return master.clusters_db[id] ? master.clusters_db[id] : null;
  };

  master.findByName = function(name) {
    var db = master.clusters_db;
    var arr = [];

    for (var key in db) {
      if (p.basename(master.clusters_db[key].idup_env.pm_exec_path) == name ||
          p.basename(master.clusters_db[key].idup_env.pm_exec_path) == p.basename(name) ||
          master.clusters_db[key].idup_env.name == name) {
        arr.push(db[key]);
      }
    }
    return arr;
  };

  master.findByScript = function(script, cb) {
    var db = master.clusters_db;
    var arr = [];

    for (var key in db) {
      if (p.basename(db[key].idup_env.pm_exec_path) == script) {
        arr.push(db[key].idup_env);
      }
    }
    cb(null, arr.length == 0 ? null : arr);
  };

  master.findByPort = function(port, cb) {
    var db = master.clusters_db;
    var arr = [];

    for (var key in db) {
      if (db[key].idup_env.port && db[key].idup_env.port == port) {
        arr.push(db[key].idup_env);
      }
    }
    cb(null, arr.length == 0 ? null : arr);
  };

  master.findByFullPath = function(path, cb) {
    var db = master.clusters_db;
    var procs = [];

    for (var key in db) {
      if (db[key].idup_env.pm_exec_path == path) {
        procs.push(db[key]);
      }
    }
    cb(null, procs.length == 0 ? null : procs);
  };

  /**
   * Check if a process is alive in system processes
   */

  master.checkProcess = function(pid) {
    if (!pid) return false;

    try {
      // Sending 0 signal do not kill the process
      process.kill(pid, 0);
      return true;
    }
    catch (err) {
      return false;
    }
  };

  master.processIsDead = function(pid, cb) {
    if (!pid) return cb({type : 'param:missing', msg : 'no pid passed'});

    var timeout;

    var timer = setInterval(function() {
      if (!master.checkProcess(pid)) {
        clearTimeout(timeout);
        clearInterval(timer);
        return cb(null, true);
      }
      return false;
    }, 50);

    timeout = setTimeout(function() {
      clearInterval(timer);
      return cb({type : 'timeout', msg : 'timeout'});
    }, 5000);
    return false;
  };

  master.killProcess = function(pid, cb) {
    if (!pid) return cb({msg : 'no pid passed or null'});

    try {
      process.kill(pid);
    } catch(e) {
      console.error('%s pid can not be killed', pid, e);
    }
    return master.processIsDead(pid, cb);
  };

  master.getNewId = function() {
    return master.next_id++;
  };

  /**
   * When a process is restarted or reloaded reset fields
   * to monitor unstable starts
   */
  master.resetState = function(idup_env) {
    idup_env.created_at = Date.now();
    idup_env.unstable_restarts = 0;
  };
};
