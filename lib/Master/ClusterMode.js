'use strict';

/**
 * @file Cluster execution functions related
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
   * For Node apps - Cluster mode
   * It will wrap the code and enable load-balancing mode
   */

  master.nodeApp = function(idup_env, cb){
    log('Entering in wrap mode');
    var clu;

    if (fs.existsSync(idup_env.pm_exec_path) == false) {
      console.error('Script ' + idup_env.pm_exec_path + ' missing');
      return cb(new Error('Script ' + idup_env.pm_exec_path + ' missing'));
    }

    try {
      clu = cluster.fork(idup_env);
    } catch(e) { console.error(e); }

    // Receive message from child
    clu.on('message', function(msg) {
      switch (msg.type) {
      case 'uncaughtException':
        master.bus.emit('process:exception', {process : clu, data : msg.stack, err : msg.err});
        break;
      case 'log:out':
        master.bus.emit('log:out', {process : clu, data : msg.data});
        break;
      case 'log:err':
        master.bus.emit('log:err', {process : clu, data : msg.data});
        break;
      default: // Permits to send message to external from the app
        master.bus.emit(msg.type ? msg.type : 'process:msg', {process : clu, data : msg });
      }
    });

    // Avoid circular dependency
    delete clu.process._handle.owner;

    clu.once('online', function() {
      if (cb) return cb(null, clu);
      return false;
    });
    return false;
  };
};
