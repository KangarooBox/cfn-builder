#!/usr/bin/env node

"use strict";

// Local
var utilities = require("../lib/utilities");
var ChangeSet = require('../lib/changeSet');

var args  = utilities.parseArguments();
var cwd   = process.cwd();

var changeSet = new ChangeSet(cwd, args);
changeSet.create();
