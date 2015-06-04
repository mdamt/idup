#!/usr/bin/env bash

#
# cli-test: Tests for master
#
# (C) 2013 Unitech.io Inc.
# MIT LICENSE
#

# Yes, we have tests in bash. How mad science is that?

node="`type -P node`"
nodeVersion="`$node -v`"
idup="`type -P node` `pwd`/bin/idup"

script="echo"

file_path="test/fixtures"

# Determine wget / curl
which wget
if [ $? -eq 1 ]
then
    http_get="wget"
else
    http_get="wget"
fi


echo $http_get

function fail {
  echo -e "######## \033[31m  ✘ $1\033[0m"
  exit 1
}

function success {
  echo -e "\033[32m------------> ✔ $1\033[0m"
}

function spec {
PREV=$?
sleep 0.2
  [ $PREV -eq 0 ] || fail "$1"
  success "$1"
}

function ispec {
PREV=$?
sleep 0.2
  [ $PREV -eq 1 ] || fail "$1"
  success "$1"
}

echo -e "\033[1mRunning tests:\033[0m"



echo "####################### DEBUG ############################"
echo "IDUP Command = " $idup
echo "Node version = " $nodeVersion
$node -e "var os = require('os'); console.log('arch : %s\nplatform : %s\nrelease : %s\ntype : %s\nmem : %d', os.arch(), os.platform(), os.release(), os.type(), os.totalmem())"
echo "###################### !DEBUG! ###########################"

cd $file_path

$idup kill
spec "kill daemon"


#
# Different way to stop process
#
$idup start echo.js
$idup start echo.js -f
$idup start echo.js -f

OUT=`$idup prettylist | grep -o "restart_time" | wc -l`
[ $OUT -eq 3 ] || fail "$1"
success "$1"

$idup stop 12412
$idup stop 0

OUT=`$idup prettylist | grep -o "stopped" | wc -l`
[ $OUT -eq 1 ] || fail "$1"
success "$1"

$idup stop asdsdaecho.js

$idup stop echo

$idup list
OUT=`$idup prettylist | grep -o "stopped" | wc -l`
[ $OUT -eq 3 ] || fail "$1"
success "$1"



#
# Main tests
#


$idup kill
spec "kill daemon"

$idup start eyayimfake
ispec "should fail if script doesnt exist"

$idup
ispec "No argument"

$idup list

$idup start cluster-idup.json
spec "Should start well formated json with name for file prefix"

$idup list
spec "Should list processes succesfully"


$idup start multi-echo.json
spec "Should start multiple applications"

$idup generate echo
spec "Should generate echo sample json"

$idup start echo-idup.json -f
spec "Should start echo service"

$idup list


$idup logs &
spec "Should display logs"
TMPPID=$!

sleep 1

kill $!
spec "Should kill logs"

$idup logs echo &
spec "Should display logs"
TMPPID=$!

sleep 1

kill $!
spec "Should kill logs"


$idup web
spec "Should start web interface"

sleep 0.3

JSON_FILE='/tmp/web-json'

$http_get -q http://localhost:9615/ -O $JSON_FILE
cat $JSON_FILE | grep "HttpInterface.js" > /dev/null
spec "Should get the right JSON with HttpInterface file launched"

$idup flush
spec "Should clean logs"

cat ~/.idup/logs/echo-out.log | wc -l
spec "File Log should be cleaned"

sleep 0.3
$http_get -q http://localhost:9615/ -O $JSON_FILE
cat $JSON_FILE | grep "restart_time\":0" > /dev/null
spec "Should get the right JSON with HttpInterface file launched"

#
# Restart only one process
#
$idup restart 1
sleep 0.3
$http_get -q http://localhost:9615/ -O $JSON_FILE
OUT=`cat $JSON_FILE | grep -o "restart_time\":1" | wc -l`
[ $OUT -eq 1 ] || fail "$1"
success "$1"

#
# Restart all processes
#
$idup restart all
spec "Should restart all processes"

sleep 0.3
$http_get -q http://localhost:9615/ -O $JSON_FILE
OUT=`cat $JSON_FILE | grep -o "restart_time\":1" | wc -l`

[ $OUT -eq 7 ] || fail "$1"
success "$1"


$idup list

$idup dump
spec "Should dump current processes"

ls ~/.idup/dump.idup
spec "Dump file should be present"

$idup stop all
spec "Should stop all processes"

sleep 0.5
OUT=`$idup prettylist | grep -o "stopped" | wc -l`
[ $OUT -eq 8 ] || fail "Process not stopped"
success "Process succesfully stopped"


$idup kill

#
# Issue #71
#

PROC_NAME='ECHONEST'
# Launch a script with name option
$idup start echo.js --name $PROC_NAME -f
OUT=`$idup prettylist | grep -o "ECHONEST" | wc -l`
[ $OUT -gt 0 ] || fail "Process not launched"
success "Processes sucessfully launched with a specific name"

# Restart a process by name
$idup restart $PROC_NAME
OUT=`$idup prettylist | grep -o "restart_time: 1" | wc -l`
[ $OUT -gt 0 ] || fail "Process name not restarted"
success "Processes sucessfully restarted with a specific name"





$idup kill

$idup resurrect
spec "Should resurect all apps"

sleep 0.5
OUT=`$idup prettylist | grep -o "restart_time" | wc -l`
[ $OUT -eq 8 ] || fail "Not valid process number"
success "Processes valid"

$idup delete all
spec "Should delete all processes"

sleep 0.5
OUT=`$idup prettylist | grep -o "restart_time" | wc -l`
[ $OUT -eq 0 ] || fail "Process not stopped"
success "Process succesfully stopped"

#
# Cron
#
$idup start cron.js -c "* * * asdasd"
ispec "Cron should throw error when pattern invalid"

$idup start cron.js -c "* * * * * *"
spec "Should cron restart echo.js"



$idup kill
spec "Should kill daemon"
