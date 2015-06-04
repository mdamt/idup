
var Master = require('..');
var numCPUs = require('os').cpus().length;
var fs = require('fs');
var path = require('path');
var should = require('should');

function getConf() {
  return process_conf = {
    pm_exec_path : path.resolve(process.cwd(), 'test/fixtures/echo.js'),
    pm_err_log_path : path.resolve(process.cwd(), 'test/echoErr.log'),
    pm_out_log_path : path.resolve(process.cwd(), 'test/echoLog.log'),
    pm_pid_file : path.resolve(process.cwd(), 'test/echopid'),
    exec_mode       : 'cluster_mode'
  };
}

describe('Master', function() {

  before(function(done) {
    Master.deleteAll({}, done);
  });

  it('should have right properties', function() {
    Master.should.have.property('prepare');
    Master.should.have.property('ping');
    Master.should.have.property('getProcesses');
    Master.should.have.property('getMonitorData');
    Master.should.have.property('getSystemData');
    Master.should.have.property('getFormatedProcesses');
    Master.should.have.property('checkProcess');
    Master.should.have.property('stopAll');
    Master.should.have.property('stopProcessId');
    Master.should.have.property('reload');
    Master.should.have.property('reloadProcessName');
    Master.should.have.property('sendSignalToProcessId');
    Master.should.have.property('sendSignalToProcessName');
  });

  describe('Special functions for Master', function() {
    before(function(done) {
      Master.deleteAll({}, done);
    });

    it('should kill a process by name', function(done) {
      Master.prepare({
        pm_exec_path    : path.resolve(process.cwd(), 'test/fixtures/echo.js'),
        pm_err_log_path : path.resolve(process.cwd(), 'test/errLog.log'),
        pm_out_log_path : path.resolve(process.cwd(), 'test/outLog.log'),
        pm_pid_path     : path.resolve(process.cwd(), 'test/child'),
        instances       : 2
      }, function(err, procs) {
	Master.getFormatedProcesses().length.should.equal(2);

        Master.stopProcessName('echo', function() {
          Master.getFormatedProcesses().length.should.equal(2);
          Master.deleteAll({}, done);
        });
      });
    });
  });

  describe('One process', function() {
    var proc, pid;

    before(function(done) {
      Master.deleteAll({}, done);
    });

    it('should fork one process', function(done) {
      Master.prepare(getConf(), function(err, proce) {
	proc = proce;
        pid = proc.process.pid;
	proc.idup_env.status.should.be.equal('online');
	Master.getFormatedProcesses().length.should.equal(1);
	done();
      });
    });
  });

  describe('Process State Machine', function() {
    var clu, pid;

    before(function(done) {
      Master.deleteAll({}, done);
    });

    it('should start a process', function(done) {
      Master.prepare(getConf(), function(err, proce) {
	clu = proce;
        pid = clu.process.pid;
	clu.idup_env.status.should.be.equal('online');
	done();
      });
    });

    it('should stop a process and keep in database on state stopped', function(done) {
      Master.stopProcessId(clu.idup_env.pm_id, function(err, dt) {
        var proc = Master.findProcessById(clu.idup_env.pm_id);
        proc.idup_env.status.should.be.equal('stopped');
        Master.checkProcess(proc.process.pid).should.be.equal(false);
        done();
      });
    });

    it('should restart the same process and set it as state online and be up', function(done) {
      Master.restartProcessId(clu.idup_env.pm_id, function(err, dt) {
        var proc = Master.findProcessById(clu.idup_env.pm_id);
        proc.idup_env.status.should.be.equal('online');
        Master.checkProcess(proc.process.pid).should.be.equal(true);
        done();
      });
    });

    it('should stop this process by name and keep in db on state stopped', function(done) {
      Master.stopProcessName(clu.name, function(err, dt) {
        var proc = Master.findProcessById(clu.idup_env.pm_id);
        proc.idup_env.status.should.be.equal('stopped');
        Master.checkProcess(proc.process.pid).should.be.equal(false);
        done();
      });
    });

    it('should restart the same process by NAME and set it as state online and be up', function(done) {
      Master.restartProcessName(clu.name, function(err, dt) {
        var proc = Master.findProcessById(clu.idup_env.pm_id);
        proc.idup_env.status.should.be.equal('online');
        Master.checkProcess(proc.process.pid).should.be.equal(true);
        done();
      });
    });

    it('should stop and delete a process id', function(done) {
      var old_pid = clu.process.pid;
      Master.deleteProcessId(clu.idup_env.pm_id, function(err, dt) {
        var proc = Master.findProcessById(clu.idup_env.pm_id);
        Master.checkProcess(old_pid).should.be.equal(false);
        dt.length.should.be.equal(0);
        done();
      });
    });

    it('should start stop and delete the process name from database', function(done) {
      Master.prepare(getConf(), function(err, _clu) {
        pid = _clu.process.pid;
	_clu.idup_env.status.should.be.equal('online');
        var old_pid = _clu.process.pid;
        Master.deleteProcessName(_clu.name, function(err, dt) {
          process.nextTick(function() {
            var proc = Master.findProcessById(clu.idup_env.pm_id);
            should(proc == null);
            Master.checkProcess(old_pid).should.be.equal(false);
            done();
          });
        });
      });
    });

    it('should start stop and delete the process name from database', function(done) {
      Master.prepare(getConf(), function(err, _clu) {
        pid = _clu.process.pid;
	_clu.idup_env.status.should.be.equal('online');
        var old_pid = _clu.process.pid;
        Master.deleteProcessName(_clu.name, function(err, dt) {
          process.nextTick(function() {
            var proc = Master.findProcessById(clu.idup_env.pm_id);
            should(proc == null);
            Master.checkProcess(old_pid).should.be.equal(false);
            done();
          });
        });
      });
    });

  });


  describe('Reload - cluster', function() {

    before(function(done) {
      Master.deleteAll({}, done);
    });

    it('should launch app', function(done) {
      Master.prepare({
        pm_exec_path    : path.resolve(process.cwd(), 'test/fixtures/child.js'),
        pm_err_log_path : path.resolve(process.cwd(), 'test/errLog.log'),
        pm_out_log_path : path.resolve(process.cwd(), 'test/outLog.log'),
        pm_pid_path     : path.resolve(process.cwd(), 'test/child'),
        instances       : 4,
        exec_mode       : 'cluster_mode',
        name : 'child'
      }, function(err, procs) {
	var processes = Master.getFormatedProcesses();

        processes.length.should.equal(4);
        processes.forEach(function(proc) {
          proc.idup_env.restart_time.should.eql(0);
        });
        done();
      });
    });

    it('should restart the same process and set it as state online and be up', function(done) {
      var processes = Master.getFormatedProcesses();

      Master.reload({}, function(err, dt) {
	var processes = Master.getFormatedProcesses();

        processes.length.should.equal(4);
        processes.forEach(function(proc) {
          proc.idup_env.restart_time.should.eql(1);
        });
        done();
      });
    });

  });

  describe('Multi launching', function() {

    before(function(done) {
      Master.deleteAll({}, done);
    });

    afterEach(function(done) {
      Master.deleteAll({}, done);
    });

    it('should launch multiple processes depending on CPUs available', function(done) {
      Master.prepare({
        pm_exec_path    : path.resolve(process.cwd(), 'test/fixtures/echo.js'),
        pm_err_log_path : path.resolve(process.cwd(), 'test/errLog.log'),
        pm_out_log_path : path.resolve(process.cwd(), 'test/outLog.log'),
        pm_pid_path     : path.resolve(process.cwd(), 'test/child'),
        instances       : 3
      }, function(err, procs) {
	Master.getFormatedProcesses().length.should.equal(3);
        procs.length.should.equal(3);
        done();
      });
    });

    it('should start maximum processes depending on CPU numbers', function(done) {
      Master.prepare({
        pm_exec_path    : path.resolve(process.cwd(), 'test/fixtures/echo.js'),
        pm_err_log_path : path.resolve(process.cwd(), 'test/errLog.log'),
        pm_out_log_path : path.resolve(process.cwd(), 'test/outLog.log'),
        pm_pid_path     : path.resolve(process.cwd(), 'test/child'),
        instances       : 10
      }, function(err, procs) {
	Master.getFormatedProcesses().length.should.equal(10);
        procs.length.should.equal(10);
        done();
      });
    });

    it('should handle arguments', function(done) {
      Master.prepare({
        pm_exec_path    : path.resolve(process.cwd(), 'test/fixtures/args.js'),
        pm_err_log_path : path.resolve(process.cwd(), 'test/errLog.log'),
        pm_out_log_path : path.resolve(process.cwd(), 'test/outLog.log'),
        pm_pid_path     : path.resolve(process.cwd(), 'test/child'),
        args            : "['-d', '-a']",
        instances       : '1'
      }, function(err, procs) {
        setTimeout(function() {
          Master.getFormatedProcesses()[0].idup_env.restart_time.should.eql(0);
          done();
        }, 500);
      });
    });
  });
});
