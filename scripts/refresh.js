#!/usr/bin/env node

"use strict";

var refresh = require("../lib/refresh");
var cwd = process.cwd();

refresh(cwd)
.then(function(data){
  console.log(util.inspect(data, {depth: null}));
})
.catch(function(err){
  console.error(err);
})