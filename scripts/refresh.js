#!/usr/bin/env node

"use strict";

var utilities = require("../lib/utilities");
var refresh = require("../lib/refresh");
var cwd = process.cwd();

const args = utilities.parseProfileArgument();

refresh(cwd)
.then(function(data){
  console.log(util.inspect(data, {depth: null}));
})
.catch(function(err){
  console.error(err);
})