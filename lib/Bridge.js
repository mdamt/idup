'use strict';

/**
 * Bridge is the intermediate code between
 * the Daemon and the CLI client
 */


/**
 * Dependencies
 */

var rpc    = require('axon-rpc');
var axon   = require('axon');
var rep    = axon.socket('rep');
var req    = axon.socket('req');
var pub    = axon.socket('pub-emitter');

var debug  = require('debug')('idup:bridge');
var util   = require('util');
var fs     = require('fs');
var p      = require('path');
var cst    = require('../constants.js');

/**
 * Export
 */

var Bridge = module.exports = {};

/**
 * Code switcher
 * It will switch between Daemon part and Client part
 *
 * This method is called at the end of this file.
 */

Bridge.onReady = function() {
  (function init() {
    if (process.env.DAEMON) {
      // DAEMON Only used for differenciating the daemon of the client
      delete process.env.DAEMON;
      process.title = 'idup: Bridge Daemonizer';
      Bridge.remoteWrapper();
    }
    else {
      Bridge.pingDaemon(function(ab) {
        // If Daemon not alive
        if (ab == false) {
          // Daemonize
          return Bridge.launchDaemon(function(err, child) {
            if (err) {
              console.error(err);
              process.exit(cst.ERROR_EXIT);
            }
            Bridge.launchRPC();
          });
        }
        return Bridge.launchRPC();
      });
    }
  })();
};

/**
 *
 * Daemon part
 *
 */

Bridge.remoteWrapper = function() {

  if (process.env.SILENT == 'true') {
    // Redirect output to files
    var stdout = fs.createWriteStream(cst.IDUP_LOG_FILE_PATH, {
      flags : 'a'
    });

    process.stderr.write = function(string) {
      stdout.write(new Date().toISOString() + ' : ' + string);
    };

    process.stdout.write = function(string) {
      stdout.write(new Date().toISOString() + ' : ' + string);
    };
  }

  // Only require here because Master init himself
  var Master = require('./Master');

  // Send ready message to Bridge Client
  process.send({
    online : true, success : true, pid : process.pid
  });

  /**
   * External interaction part
   */

  /**
   * Rep/Req - RPC system to interact with Master
   */

  var server = new rpc.Server(rep);

  debug('Daemon lauched bind on port %s addr %s', cst.DAEMON_RPC_PORT, cst.DAEMON_BIND_HOST);
  rep.bind(cst.DAEMON_RPC_PORT, cst.DAEMON_BIND_HOST);

  server.expose({
    prepare                 : Master.prepare,
    prepareJson             : Master.prepareJson,
    getMonitorData          : Master.getMonitorData,
    getSystemData           : Master.getSystemData,
    startProcessId          : Master.startProcessId,
    stopProcessId           : Master.stopProcessId,
    stopProcessName         : Master.stopProcessName,
    stopAll                 : Master.stopAll,
    softReloadProcessId     : Master.softReloadProcessId,
    reloadProcessId         : Master.reloadProcessId,
    killMe                  : Master.killMe,
    findByScript            : Master.findByScript,
    findByPort              : Master.findByPort,
    findByFullPath          : Master.findByFullPath,
    restartProcessId        : Master.restartProcessId,
    restartProcessName      : Master.restartProcessName,
    deleteProcessName       : Master.deleteProcessName,
    deleteProcessId         : Master.deleteProcessId,
    msgProcess              : Master.msgProcess,
    deleteAll               : Master.deleteAll,
    ping                    : Master.ping,
    sendSignalToProcessId   : Master.sendSignalToProcessId,
    sendSignalToProcessName : Master.sendSignalToProcessName
  });

  /**
   * Pub system for real time notifications
   */

  debug('Daemon lauched bind on port %s addr %s', cst.DAEMON_PUB_PORT, cst.DAEMON_BIND_HOST);
  pub.bind(cst.DAEMON_PUB_PORT, cst.DAEMON_BIND_HOST);

  Master.bus.onAny(function(data) {
    debug(this.event);
    pub.emit(this.event, data);
  });

};

/**
 *
 * Client part
 *
 */

/**
 * Launch the Daemon by forking this same file
 * The method Bridge.remoteWrapper will be called
 *
 * @param {Function} Callback
 * @api public
 */

Bridge.launchDaemon = function(cb) {
  debug('Launching daemon');

  var BridgeJS = p.resolve(p.dirname(module.filename), 'Bridge.js');

  var child = require('child_process').fork(BridgeJS, [], {
    silent     : false,
    detached   : true,
    cwd        : process.cwd(),
    env        : util._extend({
      'DAEMON' : true,
      'SILENT' : cst.DEBUG ? !cst.DEBUG : true,
      'HOME'   : process.env.HOME
    }, process.env),
    stdio      : 'ignore'
  }, function(err, stdout, stderr) {
    if (err) console.error(err);
    debug(arguments);
  });

  child.unref();

  child.once('message', function(msg) {
    process.emit('bridge:daemon:ready');
    console.log(msg);
    return setTimeout(function() {cb(null, child)}, 100);
  });
};

/**
 * Ping the daemon to know if it alive or not
 *
 * @param {Function} Callback
 * @api public
 */

Bridge.pingDaemon = function(cb) {
  var req = axon.socket('req');
  var client = new rpc.Client(req);

  debug('Trying to connect to server');
  client.sock.once('reconnect attempt', function() {
    client.sock.close();
    debug('Daemon not launched');
    cb(false);
  });
  client.sock.once('connect', function() {
    client.sock.close();
    debug('Daemon alive');
    cb(true);
  });
  req.connect(cst.DAEMON_RPC_PORT, cst.DAEMON_BIND_HOST);
};

/**
 * Methods to interact with the Daemon via RPC
 * This method wait to be connected to the Daemon
 * Once he's connected it trigger the command parsing (on ./bin/idup file, at the end)
 */
Bridge.launchRPC = function() {
  debug('Launching RPC client on port %s %s', cst.DAEMON_RPC_PORT, cst.DAEMON_BIND_HOST);
  Bridge.client = new rpc.Client(req);
  Bridge.ev = req.connect(cst.DAEMON_RPC_PORT, cst.DAEMON_BIND_HOST);
  Bridge.ev.on('connect', function() {
    debug('Connected to Daemon');

    process.emit('bridge:client:ready');
  });
};

Bridge.getExposedMethods = function(cb) {
  Bridge.client.methods(cb);
};

Bridge.executeRemote = function(method, env, fn) {
  Bridge.client.call(method, env, fn);
};

Bridge.killDaemon = function(fn) {
  Bridge.executeRemote('killMe', {}, fn);
};

/**
 * Call the method once every methods
 * has been taken into account
 */

Bridge.onReady();
