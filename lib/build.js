"use strict";

var async = require("async");
var fs = require("fs-extra");
var path = require("path");
var merge = require("../lib/merge");
var processTemplate = require("../lib/process-template");

function helpfulJsonParse(string) {
  try {
    return JSON.parse(string);
  } catch (e) {
    console.error("Invalid JSON:", string);
    throw e;
  }
}

function isTemplate(file) {
  return path.extname(file) === ".hbs";
}

function outputTemplateName(project, region) {
  if (project.EnvType) {
    return (project.ProjectName + "." + project.EnvType + "." + region.Id).toLowerCase() + ".template";
  } else {
    return (project.ProjectName + "." + region.Id).toLowerCase() + ".template";
  }
}

function buildContext(project, region, globals) {
  // Combine the template context with the "global" context
  var master = {};
  merge(master, project);
  merge(master, globals);
  master.Region = merge({}, region);

  // Recombine the "region" information from globals & environment into a single unit
  var regionInfo = master.EnvRegions.filter(function(item) {
    return item.Id === region.Id;
  })[0];
  merge(master.Region, regionInfo);
  delete master.Regions;
  delete master.EnvRegions;

  return master;
}

function readAndProcessTemplate(file, context, cb) {
  // Use the 'global' version of the file
  var filelocation = __dirname + '/../blueprints/' + file;
  // Unless there is a local version of that file
  try {
    fs.statSync(file);
    filelocation = file;
  } catch(err){}

  console.log('readAndProcessTemplate: '+filelocation);
  fs.readFile(filelocation, function(err, data) {
    if (err) {
      cb(err);
    } else {
      cb(undefined, processTemplate(data, context));
    }
  });
}

function build(cwd, template, cb) {
  var GLOBALS = JSON.parse(processTemplate(fs.readFileSync(cwd + "/blueprints/common/globals.hbs")));
  fs.mkdirsSync(cwd + "/artifacts/cloudformation");
  process.chdir(cwd + "/blueprints");

  // Look for files to process
  fs.readdir("stacks", function(err, files) {
    if (err) {
      cb(err);
      return;
    }

    // Filter each file to make sure its a template and then process it in its own thread
    async.each(files.filter(isTemplate), function(file, callback) {

      // Only build the requested template
      if (template){
        var pathParts = path.parse(template);
        if(file != pathParts.base && pathParts.dir.endsWith("stacks")) { return; }
      }

      GLOBALS.Regions.forEach(function(region) {
        var projectContext = merge({}, GLOBALS);
        projectContext.Region = region;

        readAndProcessTemplate("stacks/" + file, projectContext, function(projectErr, projectTemplate) {
          if (projectErr) {
            callback(projectErr);
            return;
          }

          var project = helpfulJsonParse(projectTemplate);

          // Only process templates with no region specified or one that matches the current region
          if (project.Region && project.Region !== region.Id) {
            return;
          }

          console.log("Processing " + region.Id + ":" + file);

          var master = buildContext(project, region, GLOBALS);
          readAndProcessTemplate(project.Template, master, function(masterErr, template) {
            if (projectErr) {
              callback(projectErr);
              return;
            }

            fs.writeFile(cwd + "/artifacts/cloudformation/" + outputTemplateName(project, region), template);
          });
        });
      });
    }, cb);
  });
}

module.exports = build;