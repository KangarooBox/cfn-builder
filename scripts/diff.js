#!/usr/bin/env node

'use strict';

// Local
const utilities = require('../lib/utilities');
const diff      = require('../lib/diff');

var args  = utilities.parseArguments(true);
var cwd   = process.cwd();

utilities.isCorrectAccount().then(function(correctAccount){
  if (correctAccount) { diff(cwd, args.envName, args.projectName); }
}).catch(function(err){
  console.log(err.message);
})
