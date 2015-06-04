//
// Modifying these values break tests and can break
// idup-interface module (because of ports)
//

var p = require('path');

DEFAULT_FILE_PATH = p.resolve(process.env.HOME, '.idup');



module.exports = {
  DEFAULT_FILE_PATH  : DEFAULT_FILE_PATH,
  IDUP_LOG_FILE_PATH  : p.join(p.resolve(process.env.HOME, '.idup'), 'idup.log'),
  DEFAULT_PID_PATH   : p.join(DEFAULT_FILE_PATH, 'pids'),
  DEFAULT_LOG_PATH   : p.join(DEFAULT_FILE_PATH, 'logs'),
  DUMP_FILE_PATH     : p.join(DEFAULT_FILE_PATH, 'dump.idup'),

  DAEMON_BIND_HOST   : process.env.IDUP_BIND_ADDR || 'localhost',
  DAEMON_RPC_PORT    : parseInt(process.env.IDUP_RPC_PORT)  || 6666, // RPC commands
  DAEMON_PUB_PORT    : parseInt(process.env.IDUP_PUB_PORT)  || 6667, // Realtime events

  CODE_UNCAUGHTEXCEPTION : 100,

  CONCURRENT_ACTIONS : 1,
  GRACEFUL_TIMEOUT   : parseInt(process.env.IDUP_GRACEFUL_TIMEOUT) || 4000,

  DEBUG              : process.env.IDUP_DEBUG || false,
  WEB_INTERFACE      : parseInt(process.env.IDUP_API_PORT)  || 9615,
  MODIFY_REQUIRE     : process.env.IDUP_MODIFY_REQUIRE || false,
  PREFIX_MSG         : '\x1B[32mIDUP \x1B[39m',
  PREFIX_MSG_ERR     : '\x1B[31mIDUP [ERROR] \x1B[39m',
  SAMPLE_FILE_PATH   : '../lib/sample.json',
  STARTUP_SCRIPT     : '../lib/scripts/idup-init.sh',
  SUCCESS_EXIT       : 0,
  ERROR_EXIT         : 1,

  ONLINE_STATUS      : 'online',
  STOPPED_STATUS     : 'stopped',
  ERRORED_STATUS     : 'errored',
  ONE_LAUNCH_STATUS  : 'one-launch-status',

  REMOTE_PORT        : 3900,
  REMOTE_HOST        : 'socket-1.idup.io',
  INTERACTOR_LOG_FILE_PATH : p.join(p.resolve(process.env.HOME, '.idup'), 'interactor.log'),
  INTERACTOR_PID_PATH : p.join(p.resolve(process.env.HOME, '.idup'), 'interactor.pid'),
  INTERACTOR_RPC_PORT : parseInt(process.env.IDUP_INTERACTOR_PORT) || 6668
};
