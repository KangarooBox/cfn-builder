#!/usr/bin/env node

"use strict";

// Local
var utilities = require("../lib/utilities");
var changeSet = require('../lib/changeSet');

var args  = utilities.parseArguments();
var cwd   = process.cwd();

changeSet(cwd, args, function(err){
  if (err) {
    console.error(err);
    return;
  }
});
