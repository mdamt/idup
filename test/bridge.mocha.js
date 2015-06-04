
var Bridge;
var should = require('should');
var assert = require('better-assert');
var path = require('path');

describe('Bridge', function() {

  after(function(done) {
    Bridge.killDaemon(function() {
      setTimeout(done, 400);
    });
  });

  it('should auto instancy itself, fire event and kill daemon', function(done) {
    Bridge = require('../lib/Bridge');
    process.once('bridge:client:ready', function() {
      console.log('Client ready');
      Bridge.killDaemon(function() {
        done();
      });
    });
  });

  it('should start daemon', function(done) {
    Bridge.launchDaemon(function(err, child) {
      assert(err == null);
      assert(typeof child.pid == 'number');
      Bridge.pingDaemon(function(online) {
        console.log(online);
        assert(online == true);
        done();
      });
    });
  });

  it('should have right properties', function() {
    Bridge.should.have.property('remoteWrapper');
    Bridge.should.have.property('onReady');
    Bridge.should.have.property('launchRPC');
    Bridge.should.have.property('executeRemote');
    Bridge.should.have.property('launchDaemon');
    Bridge.should.have.property('getExposedMethods');
    Bridge.should.have.property('pingDaemon');
    Bridge.should.have.property('killDaemon');
  });


  describe('DAEMON', function() {
    it('should have the right exposed methods via RPC', function(done) {
      Bridge.getExposedMethods(function(err, methods) {
        assert(err == null);
        methods.should.have.property('prepare');
        methods.should.have.property('getMonitorData');
        methods.should.have.property('getSystemData');
        methods.should.have.property('stopProcessId');
        methods.should.have.property('stopAll');
        methods.should.have.property('stopProcessName');
        methods.should.have.property('killMe');
        done();
      });
    });

    it('should get an empty process list', function(done) {
      Bridge.executeRemote('getMonitorData', {}, function(err, res) {
        assert(res.length === 0);
        done();
      });
    });

    it('should get an empty process list from system data', function(done) {
      Bridge.executeRemote('getSystemData', {}, function(err, res) {
        assert(res.processes.length === 0);
        done();
      });
    });

    it('should launch a process', function(done) {
      Bridge.executeRemote('prepare', {
        pm_exec_path    : path.resolve(process.cwd(), 'test/fixtures/echo.js'),
        pm_err_log_path : path.resolve(process.cwd(), 'test/errLog.log'),
        pm_out_log_path : path.resolve(process.cwd(), 'test/outLog.log'),
        pm_pid_path     : path.resolve(process.cwd(), 'test/child'),
        instances       : 4
      }, function(err, procs) {
	assert(err == null);
        assert(procs.length == 4);
	done();
      });
    });

    it('should list 4 processes', function(done) {
      Bridge.executeRemote('getMonitorData', {}, function(err, res) {
        assert(res.length === 4);
        done();
      });
    });

    it('should list 4 processes via system data', function(done) {
      Bridge.executeRemote('getSystemData', {}, function(err, res) {
        assert(res.processes.length === 4);
        done();
      });
    });
  });
});
