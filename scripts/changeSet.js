#!/usr/bin/env node
"use strict";

// NPM
var util    = require('util');
var _       = require('lodash');
var Table   = require('cli-table');
var colors  = require('colors');
var prompt  = require('prompt');

// Local
var utilities = require("../lib/utilities");

const SAFE    = 20;
const UNSAFE  = 21;
const ERROR   = 22;

if (process.argv.length != 4) {
  console.error("Usage: cnf-changeSet <environment_name> <project_name>");
  return;
}

var envName = process.argv[2];
var projectName = process.argv[3];
var changeSet = require("../lib/changeSet");

changeSet.create(envName, projectName)
  .then(function(data){
    switch(typeof(data)) {
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


function printTable(cs) {
  var table = new Table({
    head: ['Action', 'Logical ID', 'Resource Type', 'Replacment?']
  });

  _.each(cs.Changes, function(change){
    table.push([
      change.ResourceChange.Action,
      change.ResourceChange.LogicalResourceId,
      change.ResourceChange.ResourceType,
      _.isUndefined(change.ResourceChange.Replacement) ? '' : change.ResourceChange.Replacement
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
    prompt.get({ properties: {deploy: {
      type: 'boolean',
      required: true,
      description: "Would you like to deploy this changeset? (true/false)".green,
      message: "Please answer True or False",
      default: true
    }}}, function(err, result){
      if(result.deploy) {
        changeSet.execute(cs)
        .then(function(data){
          console.log(data);
          process.exitCode = SAFE;
        })
        .catch(function(err){
          console.error("Changeset not executed: %s", err);
          process.exitCode = ERROR;
        })
      } else {
        changeSet.delete(cs)
        .then(function(data){
          console.log("Changeset deleted.");
          process.exitCode = SAFE;
        })
        .catch(function(err){
          console.error("Changeset not deleted: %s", err);
          process.exitCode = ERROR;
        })
      }
    })

  } else {
    prompt.get({ properties: {deploy: {
      type: 'boolean',
      required: true,
      description: "This changeset is NOT safe to deploy.  Are you sure you want to deploy this changeset? (true/false)".red,
      message: "Please answer True or False",
      default: false
    }}}, function(err, result){
      if(result.deploy) {
        changeSet.execute(cs)
        .then(function(data){
          console.log(data);
          process.exitCode = UNSAFE;
        })
        .catch(function(err){
          console.error("Changeset not executed: %s", err);
          process.exitCode = ERROR;
        })
      } else {
        changeSet.delete(cs)
        .then(function(data){
          console.log("Changeset deleted.");
          process.exitCode = UNSAFE;
        })
        .catch(function(err){
          console.error("Changeset not deleted: %s", err);
          process.exitCode = ERROR;
        })
      }

      console.log("https://console.aws.amazon.com/cloudformation/home?#/changeset/detail?changeSetId=%s", cs.ChangeSetId);
      console.log(util.inspect(cs, {depth:null}));
    })
  }
}
