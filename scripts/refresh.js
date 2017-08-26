#!/usr/bin/env node
"use strict";

var refresh = require("../lib/refresh");
var cwd = process.cwd();

refresh(cwd, function(err) {
  if (err) { console.error(err); return; }
  console.log("Done.");
});