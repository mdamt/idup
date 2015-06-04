#!/bin/bash
# chkconfig: 2345 98 02
#
# description: IDUP next gen process manager for Node.js
# processname: idup
#
### BEGIN INIT INFO
# Provides:          idup
# Required-Start:    
# Required-Stop:
# Default-Start:        2 3 4 5
# Default-Stop:         0 1 6
# Short-Description: IDUP init script
# Description: IDUP is the next gen process manager for Node.js
### END INIT INFO

NAME=idup
IDUP=%IDUP_PATH%
NODE=%NODE_PATH%
USER=%USER%

export HOME="%HOME_PATH%"

super() {
    sudo -u $USER $*
}
 
start() {
    echo "Starting $NAME"
    super $NODE $IDUP resurrect
}
 
stop() {
    super $NODE $IDUP dump
    super $NODE $IDUP delete all
    super $NODE $IDUP kill
}
 
restart() {
    echo "Restarting $NAME"
    stop
    start
}
 
reload() {
    echo "Reloading $NAME"
    super $NODE $IDUP reload all
}
 
status() {
    echo "Status for $NAME:"
    $NODE $IDUP list
    RETVAL=$?
}
 
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        restart
        ;;
    reload)
        reload
        ;;
    *)
        echo "Usage: {start|stop|status|restart|reload}"
        exit 1
        ;;
esac
exit $RETVAL
