#!/usr/bin/env node

'use strict';

// Local
const utilities = require('../lib/utilities');
const diff      = require('../lib/diff');

var args  = utilities.parseArguments(true);
var cwd   = process.cwd();

diff(cwd, args.envName, args.projectName)
