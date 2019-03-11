#!/usr/bin/env node

"use strict";

// NPM
var _       = require('lodash');
var Table   = require('cli-table');
var colors  = require('colors');
var prompt  = require('prompt');

// Local
var utilities = require("../lib/utilities");
var changeSet = require("../lib/changeSet");

const SAFE    = 20;
const UNSAFE  = 21;
const ERROR   = 22;

const args = utilities.parseArguments();

// Try to deploy the changeset
function deployChangeSet(cs){
  changeSet.execute(cs)
  .then(function(data){
    console.log(data);
    process.exitCode = SAFE;
  })
  .catch(function(err){
    console.error("ChangeSet not executed: %s", err);
    process.exitCode = ERROR;
  })
}

// Try to delete the changeset
function deleteChangeSet(cs){
  changeSet.delete(cs)
  .then(function(data){
    console.log("ChangeSet deleted.");
    process.exitCode = UNSAFE;
  })
  .catch(function(err){
    console.error("ChangeSet not deleted: %s", err);
    process.exitCode = ERROR;
  })
}

function printTable(cs) {
  var table = new Table({
    head: ['Action', 'Logical ID', 'Resource Type', 'Replacement?'],
    style: { head:[] }
  });

  _.each(cs.Changes, function(change){
    var style = null;
    switch (change.ResourceChange.Action) {
      case 'Add':
        style = colors.blue;
        break;
      case 'Remove':
        style = colors.red;
        break;
      case 'Modify':
        style = colors.yellow;
        break;
      default:
        style = colors.green;
    }
    table.push([
      style(change.ResourceChange.Action),
      style(change.ResourceChange.LogicalResourceId),
      style(change.ResourceChange.ResourceType),
      style(_.isUndefined(change.ResourceChange.Replacement) ? '' : change.ResourceChange.Replacement)
    ]);
  })

  console.log(table.toString());
}


function displayResults(cs) {
  printTable(cs);

  var isSafe = utilities.isSafeToApplyChangeSet(cs);
  prompt.start();
  prompt.message = '';

  // If this changeset is safe to deploy, ask the user if they actually want to deploy it
  if(isSafe){
    if(args.unattended){
      deployChangeSet(cs);
    } else {
      prompt.get({
        properties: {
          deploy: {
            type: 'boolean',
            required: true,
            description: "Would you like to deploy this ChangeSet? (true/false)".green,
            message: "Please answer True or False",
            default: true
          }
        }
      }, function(err, result){
        if(result.deploy) {
          deployChangeSet(cs);
        } else {
          deleteChangeSet(cs);
        }
      })
    }
  } else if(args.unattended){
      deleteChangeSet(cs);
    } else {
      prompt.get({
        properties: {
          deploy: {
            type: 'boolean',
            required: true,
            description: "This ChangeSet is NOT safe to deploy.  Are you sure you want to deploy this ChangeSet? (true/false)".red,
            message: "Please answer True or False",
            default: false
          }
        }
      }, function(err, result){
        if(result.deploy) {
          deployChangeSet(cs);
        } else {
          deleteChangeSet(cs);
        }

        console.log("https://console.aws.amazon.com/cloudformation/home?#/changeset/detail?changeSetId=%s", cs.ChangeSetId);
        // console.log(util.inspect(cs, {depth:null}));
      })
    }
}


changeSet.create(args.envName, args.projectName, args.region)
  .then(function(data){
    switch(typeof (data)) {
      // We got back a string which is probably a status update
      case 'string':
        console.log(data);
        break;

      // We got back a CFN object, do something with it
      case 'object':
        if(data.ChangeSetId) {
          displayResults(data);
        } else {
          // This is not a valid ChangeSet, ignore it
          process.exitCode = SAFE;
        }
        break;

      // We don't know what we got back
      default:
        console.log("ERROR: Unknown return from createChangeSet: %s".red.underline, data);
        process.exitCode = ERROR
    }
  })
  .catch(function(err){
    console.error(err);
    process.exitCode = ERROR;
})
