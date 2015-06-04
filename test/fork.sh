#!/usr/bin/env bash

#
# Testing the fork mode
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

function should {
    OUT=`$idup prettylist | grep -o "$2" | wc -l`
    [ $OUT -eq $3 ] || fail "$1"
    success "$1"
}

cd $file_path

########### Fork mode
$idup kill

$idup start echo.js -x
should 'should has forked app' 'fork' 1

$idup restart echo.js
should 'should has forked app' 'restart_time: 1' 1

########### Fork mode
$idup kill

$idup start bashscript.sh -x --interpreter bash
should 'should has forked app' 'fork' 1

########### Auto Detective Interpreter In Fork mode

$idup kill

$idup start echo.coffee -x --interpreter coffee
should 'should has forked app' 'fork' 1

### Dump resurect should be ok
$idup dump

$idup kill

#should 'should has forked app' 'fork' 0

$idup resurrect
should 'should has forked app' 'fork' 1

## Delete

$idup list

$idup delete 0
should 'should has delete process' 'fork' 0
