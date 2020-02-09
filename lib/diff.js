'use strict';

const AWS     = require('aws-sdk');
const fs      = require('fs-extra');
const path    = require('path');
const util    = require('util');
const _       = require('lodash');
const Table   = require('cli-table3');
const colors  = require('colors');
const jsondiffpatch = require('jsondiffpatch');
const processTemplate = require("../lib/process-template");

const MAX_RETRIES = 15;
const GLOBALS = JSON.parse(processTemplate(fs.readFileSync("./blueprints/common/globals.hbs")));
const REGIONS = {};

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
function readAndGenerateDiff(file) {
  return new Promise( (resolve, reject) => {
    fs.readFile(file, function(err, data){
      if (err) reject(util.format("File '%s' not found.", file));
      else {
        var localTemplate = JSON.parse(data);
        var metadata  = localTemplate.Metadata;
        var region    = metadata.Region;
        var stackName = buildStackName(metadata.Environment, metadata.Version, metadata.ProjectName);

        var cfn = REGIONS[region];
        cfn.getTemplate({ StackName: stackName }, function(err, template){
          if (err) { reject(util.format("Stack '%s : %s' not found: %s", stackName, region, err)); return; }

          var awsTemplate = JSON.parse(template.TemplateBody);
          var delta = jsondiffpatch.create({
            objectHash: function(obj, index) {
              return obj.name || obj.id || obj._id || '$$index:'+index;
            }
          }).diff(awsTemplate, localTemplate);

          resolve({
            delta: delta, stackName: stackName, region: region,
            environment: metadata.Environment, project: metadata.ProjectName
          });
        })
      }
    })
  });
}

function getDiff(cwd, environment, project) {
  process.chdir(cwd + '/artifacts/cloudformation/');
  var promises = [];

  GLOBALS.Regions.forEach(function(region){
    var fileName  = [project, environment, region.Id, 'template'].join('.').toLowerCase();
    promises.push(readAndGenerateDiff(fileName));
  });

  return new Promise((resolve, reject) => {
    Promise.allSettled(promises)
    .then(function(values){
      resolve(values);
    })
    .catch(function(err){
      reject(err);
    })
  });
}

function diff(cwd, environment, project) {
  var promises = [];
  var deltas = [];

  var table = new Table({
    head: ['Project', 'Environment', 'Region', 'Stack Name', 'Diffs'],
    style: { head:[] }
  })

  if (environment == null && project == null) {
    // Check all the blueprints in this environment
    const files = fs.readdirSync(cwd + '/blueprints/stacks', {withFileTypes: true});
    _.each(files, function(file){
      if (file.isFile()) {
        var nameArr = file.name.split('.');
        promises.push(getDiff(cwd, nameArr[1], nameArr[0]));
      }
    });
  } else {
    // Only check a single project
    promises.push(getDiff(cwd, environment, project));
  }

  Promise.allSettled(promises)
  .then(function(values){
    _.each(values, function(value){
      _.each(value.value, function(data){
        if ('fulfilled' == data.status) {
          var diffCount = 0;
          if (data.value.delta) {
            var style = colors.red;
            diffCount = Object.keys(data.value.delta.Resources).length;
            deltas.push(data.value.delta);
          } else {
            var style = colors.green;
          }
          table.push([
            style(data.value.project),
            style(data.value.environment),
            style(data.value.region),
            style(data.value.stackName),
            style(diffCount)
          ]);
        }
      });
    });

    // How much information do we have to display?
    if (deltas.length > 1) {
      // Show a table
      console.log(table.toString());
    } else {
      // Just print the diff
      jsondiffpatch.console.log(deltas[0]);
    }
  })
}

module.exports = diff;
