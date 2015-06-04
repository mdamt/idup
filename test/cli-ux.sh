
#!/usr/bin/env bash

#
# cli-test: Tests for master
#
# (C) 2013 Unitech.io Inc.
# MIT LICENSE
#

# Yes, we have tests in bash. How mad science is that?


node="`type -P node`"
idup="`type -P node` `pwd`/bin/idup"

script="echo"

file_path="test/fixtures"

function fail {
  echo -e "\033[31m  ✘ $1\033[0m"
  exit 1
}

function success {
  echo -e "\033[32m  ✔ $1\033[0m"
}

function spec {
  [ $? -eq 0 ] || fail "$1"
  success "$1"
}

function ispec {
  [ $? -eq 1 ] || fail "$1"
  success "$1"
}


echo -e "\033[1mRunning tests:\033[0m"

which wrk
spec "You should have wrk benchmark in your /usr/bin"

killall node

cd $file_path
$idup start cluster-idup.json
$idup start cluster-idup.json -f
$idup start cluster-idup.json -f
$idup start cluster-idup.json -f
spec "start cluster"

wrk -c 500 -t 500 -d 8 http://localhost:8020 &> /dev/null &
$idup monit
$idup list
$idup stop
