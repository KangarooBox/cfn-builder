#!/usr/bin/env node

"use strict";

var sync = require("../lib/sync");
var cwd = process.cwd();

sync(cwd, function(err) {
  if (err) { console.error(err); return; }
  console.log("Done.");
});