#!/usr/bin/env node

"use strict";

var fs = require("fs-extra");
var build = require("../lib/build");
var cwd = process.cwd();

fs.watch("blueprints", {"recursive":true}, function(type,filename){
  if(filename){
    process.chdir(cwd);
    build(cwd, filename, function(err) {
      if (err) { console.error(err); return; }
    });
  }
});


