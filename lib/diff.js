'use strict';

const AWS     = require('aws-sdk');
const fs      = require('fs-extra');
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
            delta: delta,
            stackName: stackName,
            region: region,
            environment: metadata.Environment,
            project: metadata.ProjectName
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
  var singleProject = false;
  var exitCode = 0;

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
    singleProject = true;
    promises.push(getDiff(cwd, environment, project));
  }

  Promise.allSettled(promises)
  .then(function(values){
    _.each(values, function(value){
      _.each(value.value, function(data){
        if ('fulfilled' == data.status) {
          var diffCount = 0;
          var style = colors.green;
          if (data.value.delta) {
            if (data.value.delta.Resources) {
              diffCount = Object.keys(data.value.delta.Resources).length;
              style = colors.red;
              exitCode += 1;
            } else {
              diffCount = '-';
              style = colors.blue;
            }
            deltas.push(data.value.delta);
          }
          table.push([
            style(data.value.project),
            style(data.value.environment),
            style(data.value.region),
            style(data.value.stackName),
            style(diffCount)
          ]);
        } else {
          // Add any "missing" stacks
          if(data.reason.startsWith("Stack")) {
            var name_region_arr = data.reason.split("'")[1].split(":");
            var stack_name_arr = name_region_arr[0].split('-');
            var stack_name = stack_name_arr[0];
            var style = colors.cyan;

            table.push([
              style(stack_name_arr[0].trim()),
              style(stack_name_arr[1]).trim(),
              style(name_region_arr[1].trim()),
              style(name_region_arr[0].trim()),
              style('X')            
            ])
          }
        }
      });
    });

    // How much information do we have to display?
    if (singleProject) {
      // Just print the diff
      jsondiffpatch.console.log(deltas[0]);
    } else {
      // Show a table
      console.log(table.toString());
    }

    // exit = how many 'diffs' we had
    process.exitCode = exitCode;
  })
}

module.exports = diff;
