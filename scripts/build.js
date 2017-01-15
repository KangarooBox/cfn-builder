#!/usr/bin/env node
"use strict";

var template = process.argv[2];
var build = require("../lib/build");
var cwd = process.cwd();

build(cwd, template, function(err) {
  if (err) { console.error(err); return; }
  console.log("Done.");
});