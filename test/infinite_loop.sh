
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
sleep 1
  [ $PREV -eq 0 ] || fail "$1"
  success "$1"
}

function ispec {
PREV=$?
sleep 1
  [ $PREV -eq 1 ] || fail "$1"
  success "$1"
}


function should()
{
    OUT=`$idup prettylist | grep -o "$2" | wc -l`
    [ $OUT -eq $3 ] || fail "$1"
    success "$1"

}

cd $file_path


echo "Starting infinite loop tests"

$idup kill



$idup start killtoofast.js --name unstable-process

echo -n "Waiting for process to restart too many times and idup to stop it"

for (( i = 0; i <= 50; i++ )); do
    sleep 0.1
    echo -n "."
done


$idup list
should 'should has stopped unstable process' 'errored' 1

$idup kill

echo "Start infinite loop tests for restart|reload"

cp killnotsofast.js killthen.js

$idup start killthen.js --name killthen

$idup list

should 'should killthen alive for a long time' 'online' 1

# Replace killthen file with the fast quit file

sleep 15
cp killtoofast.js killthen.js

echo "Restart with unstable process"

$idup list

$idup restart all  # idup reload should also work here

for (( i = 0; i <= 50; i++ )); do
    sleep 0.1
    echo -n "."
done

$idup list

should 'should has stoped unstable process' 'errored' 1

rm killthen.js

$idup list

$idup kill
