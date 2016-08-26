#!/usr/bin/env node
'use strict';

var diff = require('../lib/diff');

if (process.argv.length != 4) {
  console.error("Usage: diff <environment_name> <project_name>");
  return;
}

var cwd = process.cwd();
var env_name = process.argv[2];
var project_name = process.argv[3];

diff(cwd, env_name, project_name, function(err){
  if (err) {
    console.error(err);
    return;
  }
});
