'use strict';

var AWS = require('aws-sdk');
var async = require('async');
var fs = require('fs-extra');
var path = require('path');
var util = require('util');
var jsondiffpatch = require('jsondiffpatch');
var processTemplate = require("../lib/process-template");

var MAX_RETRIES = 15;
// var GLOBALS = JSON.parse(fs.readFileSync('./blueprints/common/globals.hbs'));
var GLOBALS = JSON.parse(processTemplate(fs.readFileSync("./blueprints/common/globals.hbs")));
var REGIONS = {};
// Create an AWS CNF object for each region
GLOBALS.Regions.forEach(function(region){
  REGIONS[region.Id] = new AWS.CloudFormation({maxRetries: MAX_RETRIES, apiVersion: '2010-05-15', region: region.Id})
})

// Use the project information to create a stack name
function buildStackName(environment, version, project) {
  var stack_name_arr = [];

  stack_name_arr[0] = project;
  stack_name_arr[1] = version + environment.charAt(0).toUpperCase() + environment.slice(1);
  return stack_name_arr.filter(function(e) {return e === 0 ? '0' : e}).join('-');
}

// Generate the diff
function readAndGenerateDiff(file, cb){
  fs.readFile(file, function(err, data){
    if(err){
      cb(util.format("File '%s' not found.", file));
    } else {
      var localTemplate = JSON.parse(data);
      var metadata  = localTemplate.Metadata;
      var region    = metadata.Region;
      var stackName = buildStackName(metadata.Environment, metadata.Version, metadata.ProjectName);

      var cfn = REGIONS[region];
      cfn.getTemplate({ StackName: stackName }, function(err, template){
        if (err) { cb(util.format("Stack '%s : %s' not found: %s", stackName, region, err)); return; }

        var awsTemplate = JSON.parse(template.TemplateBody);
        var delta = jsondiffpatch.create({
          objectHash: function(obj, index) {
            return obj.name || obj.id || obj._id || '$$index:'+index;
          }
        }).diff(awsTemplate, localTemplate);

        var message = util.format("Stack '%s : %s' differences: none", stackName, region);
        if (delta) {
          var output = jsondiffpatch.formatters.console.format(delta);
          message = util.format("Stack '%s : %s' differences:\n%s", stackName, region, output);
        }

        cb(null, message);
      })
    }
  })
}

function diff(cwd, environment, project, cb) {
  process.chdir(cwd + '/artifacts/cloudformation/');

  GLOBALS.Regions.forEach(function(region){
    var fileName  = [project, environment, region.Id, 'template'].join('.');

    readAndGenerateDiff(fileName, function(err, message){
      if (err) {
        console.error(err);
      } else {
        console.log(message);
      }
    });

  })
  // cb();
}

module.exports = diff;