#!/usr/bin/env node

"use strict";

var build = require("../lib/build");
var cwd = process.cwd();

build(cwd, function(err) {
  if (err) {
    console.error(err);
    return;
  }
  console.log("Done.");
});