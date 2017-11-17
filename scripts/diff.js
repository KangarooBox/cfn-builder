#!/usr/bin/env node

'use strict';

// Local
var utilities = require("../lib/utilities");
var diff      = require('../lib/diff');

var args  = utilities.parseArguments();
var cwd   = process.cwd();

diff(cwd, args.envName, args.projectName, function(err){
  if (err) {
    console.error(err);
    return;
  }
});
