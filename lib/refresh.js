'use strict';

const AWS  = require('aws-sdk');
const util = require('util');
const _    = require('lodash');
const fs   = require('fs');
const sem  = require('semaphore')(1);
const stringify = require('json-stringify-pretty-compact');

const processTemplate = require('../lib/process-template');

// Get the most recent AMI from Amazon
function getAMI(input_params, region = 'us-east-1') {
  AWS.config.update({region: region});
  var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

  var params = {
    Filters: [
      { Name: 'name', Values: [ input_params.Name ] },
      { Name: 'state', Values: [ 'available' ] }
    ],
    Owners: input_params.Owners
  };

  // Add optional parameters
  if (input_params.Platform) {
    params['Filters'] << { Name: 'platform', Values: [ input_params.Platform ] }
  }

  // Get the most recent AMI and return it in a Promise.
  return new Promise(function(fulfill, reject){
    // Is this a static AMI assignment?
    if(input_params.AMI) {
      // Build a 'dummy' image instead of searching
      var image = {};

      if(input_params.Region == region){
        image = {"Id":input_params.Id, "ImageId": input_params.AMI};
      }

      fulfill(image);
    } else {
      // Search AWS for a matching image
      ec2.describeImages(params, function(err, data){
        if(err) reject(err);
        else {
          try {
            var image = _.orderBy(data.Images, ['CreationDate'], ['desc'])[0];
            if(image) {
              image.Id = input_params.Id;
            } else {
              image = {}
            }

            // console.log(image);
            fulfill(image);
          } catch(e){
            console.log(e)
          }
        }
      });
    }
  });
}

// Update the AMIs using information in the Globals blueprint
function updateAMIs(cwd) {
  const globals_filepath = util.format("%s/blueprints/common/globals.hbs", cwd);
  var GLOBALS = null;

  return new Promise(function(fulfill, reject){
    try {
      GLOBALS = JSON.parse(processTemplate(fs.readFileSync(globals_filepath)));
    } catch(err) {
      reject(util.format("Can't find your 'globals.hbs' file at '%s'.  Please create one and try again.\n%s", globals_filepath, err));
    }

    // Process each region
    GLOBALS.Regions.forEach(function(region){
      var promises = [];

      try{
        // Start the process of getting the current AMIs...
        GLOBALS.AMIs.forEach(function(ami){ promises.push(getAMI(ami, region.Id)); })

        // Wait until all the AMIs are retrieved...
        Promise.all(promises)
        .then(function(values){
          // Gather the AMI information for this region
          var currentAMIs = {};
          values.forEach(function(value){currentAMIs[value.Id] = value.ImageId;})

          sem.take(function(){
            // Update the GLOBALS file with the AMI information
            fs.readFile(globals_filepath, function(err, data){
              if (err) reject(util.format("Unable to read GLOBALS file: %s", err));
              else {
                // Since the "globals" file is a Handlebars file and *might* contain
                // "weird" things it might not parse as normal JSON.  Therefor we have
                // to comment out all the handlebars structures.  This is done by
                // turning them into a JSON node called JSON_SANITIZE.  After we're
                // done modifying the JSON we remove the JSON_SANITIZE nodes.
                var sanitized = data.toString().replace(/(\{\{.*\}\})/g, "\"JSON_SANITIZE\":\"$1\"");

                // Replace the "AMIs" structure for this Region
                var json = JSON.parse(sanitized);
                var regionIndex = _.findIndex(json.Regions, { Id: region.Id} )
                json.Regions[regionIndex].AMIs = currentAMIs;

                // Put the "handlebars" structures back
                var unsanitized = stringify(json, {maxLength:150}).replace(/\"JSON_SANITIZE\".*(\{\{.*\}\})\"/g, " $1 ")

                // Since there can be multiple Regions in the GLOBALS file, we need a semaphore to
                // prevent writing the file from another thread before we've finished updating it here
                console.log("Updating AMIs in region '%s'...", region.Id);
                fs.writeFileSync(globals_filepath, unsanitized);
                sem.leave();
              }
            });
          });
        })
        .catch(function(err){
          console.log("There was a problem finding the AMIs for '%s': %s", region.Id, err);
        });
      } catch (err){
        reject(util.format("AMIs not updated: %s", err));
      }
    });
  });
}

module.exports = updateAMIs;