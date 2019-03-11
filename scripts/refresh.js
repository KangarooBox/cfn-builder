#!/usr/bin/env node

"use strict";

var utilities = require("../lib/utilities");
var refresh = require("../lib/refresh");
var cwd = process.cwd();
var util  = require('util');

refresh(cwd)
.then(function(data){
  console.log(util.inspect(data, {depth: null}));
})
.catch(function(err){
  console.error(err);
})