#!/usr/bin/env bash

#
# cli-test: Tests for master
#
# (C) 2013 Unitech.io Inc.
# MIT LICENSE
#

# Yes, we have tests in bash. How mad science is that?

# export IDUP_RPC_PORT=4242
# export IDUP_PUB_PORT=4243

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

echo "################## RELOAD ###################"

###############
$idup kill

echo "Reloading"
$idup start child.js -i 4
should 'should start processes' 'online' 4
$idup restart all
should 'should restarted be one for all' 'restart_time' 4
$idup restart child.js
should 'should restart a second time (BY SCRIPT NAME)' 'restart_time: 2' 4
$idup restart child
should 'should restart a third time (BY NAME)' 'restart_time: 3' 4
$idup reload all
should 'should RELOAD a fourth time' 'restart_time: 4' 4

############### CLUSTER STUFF
$idup kill

echo "Reloading"
$idup start child.js -i 4
should 'should start processes' 'online' 4

$idup start network.js -i 4
should 'should has 8 online apps' 'online' 8

should 'should has 4 api online' 'network.js' 4
should 'should has 4 child.js online' 'child.js' 4

$idup reload all
should 'should reload all' 'restart_time' 8

$idup reload child.js
should 'should reload only child.js' 'restart_time: 2' 4

$idup reload network.js
should 'should reload network.js' 'restart_time: 2' 8

############### BLOCKING STUFF

# this is not a networked application
$idup start echo.js
should 'should has 8 online apps' 'online' 9

$idup reload echo
should 'should not hang and fallback to restart behaviour' 'restart_time' 9



#$idup web
#$idup reload all
$idup kill
