#!/usr/bin/env node

"use strict";

const refresh = require("../lib/refresh");
const util  = require('util');

var cwd = process.cwd();

refresh(cwd)
.then(function(data){
  console.log(util.inspect(data, {depth: null}));
})
.catch(function(err){
  console.error(err);
})