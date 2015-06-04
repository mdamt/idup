

var iidup  = require('idup-interface');

var axon  = require('axon');
var rpc   = require('axon-rpc');
var sock  = axon.socket('pub');
var util  = require('util');
var debug = require('debug')('driver'); // Interface
var os    = require('os');
var cst   = require('../constants.js');
var fs    = require('fs');

var rep   = axon.socket('rep');

var iidupa;
var server;

var Interactor        = module.exports = {};

var MACHINE_NAME;
var SECRET_KEY;

function get_process_id(name, id) {
  return MACHINE_NAME + ':' + name + ':' + id;
}

var Filter = {
  filter_monitoring : function(processes) {
    var filter_procs = {};
    if (!processes) return null;

    processes.forEach(function(proc) {
      filter_procs[get_process_id(proc.idup_env.name,proc.idup_env.pm_id)] = [proc.monit.cpu, proc.monit.memory];
    });

    var monit = {
      loadavg   : os.loadavg(),
      total_mem : os.totalmem(),
      free_mem  : os.freemem(),
      processes : filter_procs
    };

    return monit;
  },
  filter_exception : function(exception) {
    return exception.err;
  },
  /**
   * Filter data to send when process go online or offline
   */
  filter_process_state_change : function(process) {
    var state = {
      state        : process.idup_env.status,
      name         : process.idup_env.name,
      pm_id        : process.idup_env.pm_id,
      restart_time : process.idup_env.restart_time,
      uptime       : process.idup_env.uptime
    };
    return state;
  },
  /**
   * Filter log
   */
  filter_log : function(log) {
    return log.data;
  }
};

var Interact = {
  redirect_event : function() {
    var process_id = '';

    iidupa.bus.on('*', function(event, data){
      if (data.idup_env)
        delete data.idup_env.env;
      //delete data.process;

      switch (event) {
      case 'process:online':
      case 'process:exit':
        process_id = get_process_id(data.idup_env.name,data.idup_env.pm_id);
        data = Filter.filter_process_state_change(data);
        // Send new status
        setTimeout(Interact.send_status_data, 800);
        send_data(event, data, process_id);
        break;
      case 'process:exception':
        process_id = get_process_id(data.process.idup_env.name, data.process.idup_env.pm_id);
        data = Filter.filter_exception(data);
        send_data(event, data, process_id);
        break;
      case 'log:err':
      case 'log:out':
        process_id = get_process_id(data.process.idup_env.name, data.process.idup_env.pm_id);
        data = Filter.filter_log(data);
        send_data(event, data, process_id);
        break;
      default:
        if (data.process && data.process.idup_env)
          process_id = get_process_id(data.process.idup_env.name, data.process.idup_env.pm_id);
        else if (data.idup_env)
          process_id = get_process_id(data.idup_env.name,data.idup_env.pm_id);
        else
          process_id = null;
        delete data.process;
        send_data(event, data.data, process_id);
      }

      debug('Sent %s event', event);
    });
  },
  send_monitor_data : function() {
    iidupa.rpc.getMonitorData({}, function(err, dt) {
      var ret;
      /*
       * Filter send also loadavg, free mem, mem, and processes usage
       */
      if ((ret = Filter.filter_monitoring(dt)))
        send_data('monitoring', ret);
    });
  },
  launch_workers : function() {
    this.t1 = setInterval(Interact.send_monitor_data, 5000);
    this.t2 = setInterval(Interact.send_status_data, 2500);
  },
  stop_workers : function() {
    var self = this;

    clearInterval(self.t1);
    clearInterval(self.t2);
  },
  send_status_data : function() {
    iidupa.rpc.getMonitorData({}, function(err, processes) {
      var filter_procs = [];

      if (!processes) return debug('Fail accessing to getMonitorData');

      processes.forEach(function(proc) {
        filter_procs.push({
          pid          : proc.pid,
          name         : proc.idup_env.name,
          interpreter  : proc.idup_env.exec_interpreter,
          restart_time : proc.idup_env.restart_time,
          created_at   : proc.idup_env.created_at,
          pm_uptime    : proc.idup_env.pm_uptime,
          status       : proc.idup_env.status,
          pm_id        : proc.idup_env.pm_id,
          cpu          : proc.monit.cpu,
          memory       : proc.monit.memory,
          process_id   : get_process_id(proc.idup_env.name, proc.idup_env.pm_id)
        });
      });

      return send_data('status', {
        process : filter_procs,
        server : {
          loadavg   : os.loadavg(),
          total_mem : os.totalmem(),
          free_mem  : os.freemem(),
          cpu       : os.cpus(),
          hostname  : os.hostname(),
          uptime    : os.uptime(),
          type      : os.type(),
          platform  : os.platform(),
          arch      : os.arch()
        }
      });
    });
  }
};

function send_data(event, data, process_id) {
  sock.send(JSON.stringify({
    event : event,
    data : data,
    meta : {
      server_name : MACHINE_NAME,
      id_key : SECRET_KEY,
      process_id : process_id || ''
    }
  }));
}

function listen() {
  iidupa = iidup({bind_host: 'localhost'});

  iidupa.on('ready', function() {
    debug('Succesfully connected to idup');

    Interact.launch_workers();
    /**
     * Forward all events to remote
     */
    Interact.redirect_event();

  });

  iidupa.on('reconnecting', function() {
    debug('Reconnecting to idup');
    Interact.stop_workers();
    iidupa.removeAllListeners();
    iidupa.disconnect();
    if (iidupa)
      delete iidupa;
    setTimeout(listen, 1000);
  });
}

Interactor.launch = function() {
  MACHINE_NAME = process.env.IDUP_MACHINE_NAME;
  SECRET_KEY   = process.env.IDUP_SECRET_KEY;

  if (cst.DEBUG)
    sock.connect(3900);
  else
    sock.connect(cst.REMOTE_PORT, cst.REMOTE_HOST);

  if (!MACHINE_NAME) {
    console.error('You must provide a IDUP_MACHINE_NAME environment variable');
    process.exit(0);
  }
  else if (!SECRET_KEY) {
    console.error('You must provide a IDUP_SECRET_KEY environment variable');
    process.exit(0);
  }

  listen();
};

Interactor.expose = function() {
  server.expose({
    kill : function(cb) {
      console.log('Killing interactor');
      cb();
      setTimeout(function() {process.exit(cst.SUCCESS_EXIT) }, 500);
    }
  });
};

Interactor.daemonize = function() {
  console.log('Initializing interactor daemon');

  var stdout = fs.createWriteStream(cst.INTERACTOR_LOG_FILE_PATH, {
    flags : 'a'
  });

  process.stderr.write = function(string) {
    stdout.write(new Date().toISOString() + ' : ' + string);
  };

  process.stdout.write = function(string) {
    stdout.write(new Date().toISOString() + ' : ' + string);
  };

  process.title = 'idup : Interactor - Watchdog';

  process.send({
    part : 'Interactor - Watchdog', online : true, success : true, pid : process.pid
  });

  server = new rpc.Server(rep);
  rep.bind(cst.INTERACTOR_RPC_PORT);

  console.log('Launching interactor daemon');
  Interactor.expose();
  Interactor.launch();
};

if (cst.DEBUG)
  Interactor.launch();
else
  Interactor.daemonize();
