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
  [ $? -eq 0 ] || fail "$1"
  success "$1"
}

function ispec {
  [ $? -eq 1 ] || fail "$1"
  success "$1"
}

function should {
    OUT=`$idup prettylist | grep -o "$2" | wc -l`
    [ $OUT -eq $3 ] || fail "$1"
    success "$1"
}

cd $file_path

############# TEST

echo -e "\033[1mRunning tests:\033[0m"

$idup kill
spec "kill daemon"

echo "---- Start an app, stop it, if state stopped and started, restart stopped app"
$idup start echo.js
spec "Should start an app by script.js"
$idup stop echo.js
spec "Should stop an app by script.js"
$idup restart echo.js
spec "Should restart an app by script.js (TRANSITIONAL STATE)"

###############
$idup kill

echo "---- BY_NAME Start an app, stop it, if state stopped and started, restart stopped app"

$idup start echo.js --name gege
should 'should app be online' 'online' 1
$idup stop gege
should 'should app be stopped' 'stopped' 1
$idup restart gege
should 'should app be online once restart called' 'online' 1

###############
$idup kill

echo "Start an app, start it one more time, if started, throw message"
$idup start echo.js
$idup start echo.js
ispec "Should not re start app"


###############
$idup kill

cd ../..

echo "Change path try to exec"
$idup start test/fixtures/echo.js
should 'should app be online' 'online' 1
$idup stop test/fixtures/echo.js
should 'should app be stopped' 'stopped' 1
$idup start test/fixtures/echo.js
should 'should app be online' 'online' 1

cd -


########### DELETED STUFF BY ID
$idup kill

$idup start echo.js
$idup delete 0
should 'should has been deleted process by id' "name: 'echo'" 0

########### DELETED STUFF BY NAME
$idup kill

$idup start echo.js --name test
$idup delete test
should 'should has been deleted process by name' "name: 'test'" 0

########### DELETED STUFF BY SCRIPT
$idup kill

$idup start echo.js
$idup delete echo.js
$idup list
should 'should has been deleted process by script' "name: 'echo'" 0


########### OPTIONS OUTPUT FILES
$idup kill

$idup start echo.js -o outech.log -e errech.log --name gmail -i 10
sleep 0.5
cat outech-0.log > /dev/null
spec "file outech.log exist"
cat errech-0.log > /dev/null
spec "file errech.log exist"
should 'should has not restarted' 'restart_time: 0' 10
