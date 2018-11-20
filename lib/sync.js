'use strict';

var AWS = require('aws-sdk');
var S3 = new AWS.S3({apiVersion: '2006-03-01'});
var fs = require('fs');
var path = require('path');
var glob = require('glob');
var md5 = require('md5');
var processTemplate = require("../lib/process-template");

var MAX_CFN_SIZE = 50000;
var MAX_RETRIES = 15;
var GLOBALS = JSON.parse(processTemplate(fs.readFileSync("./blueprints/common/globals.hbs")));
var REGIONS = {};

// Create an AWS CNF object for each region
GLOBALS.Regions.forEach(function(region){
  REGIONS[region.Id] = new AWS.CloudFormation({maxRetries: MAX_RETRIES, apiVersion: '2010-05-15', region: region.Id})
})


// Synchronize files in S3 with the local file system
function sync(cwd, cb) {

  GLOBALS.Regions.forEach(function(region){
    // user-data scripts should be synced to S3 so that CloudInit can read them
    var sourcePath = path.join(cwd, 'artifacts', 'user-data');
    glob(cwd + '/artifacts/user-data/**/*', {nodir: true}, function(err, files){
      files.forEach(function(file){
        var fileName = path.basename(file);
        var filePath = path.relative(sourcePath, file);

        // console.log(`Syncing file '${fileName}' to '${region.ArtifactsBucket}/user-data/${filePath}'`);
        fs.readFile(file, function(err, data){
          if(err){
            console.log(`Error reading file '${filePath}'`);
            return;
          } else {
            var params = {
              Bucket: region.ArtifactsBucket,
              Key: `user-data/${filePath}`
            };

            S3.getObject(params, function(err, metadata){
              if(err){
                params.StorageClass = 'STANDARD';
                params.Body = data;

                S3.putObject(params, function(err2, data){
                  if(err2) {
                    console.log(`Error uploading '${filePath}' to S3: ${err2}`);
                    return;
                  } else {
                    console.log(`'${filePath}' uploaded to ${params.Bucket}`);
                  }
                });
              } else {
                var localSum = md5(data);
                var s3Sum = JSON.parse(metadata.ETag);
                if(localSum === s3Sum){
                } else {
                  // console.log(`no update necessary for '${filePath}'`);
                  params.StorageClass = 'STANDARD';
                  params.Body = data;

                  S3.putObject(params, function(err, data){
                    if(err) {
                      console.log(`Error uploading '${filePath}' to S3: ${err}`);
                      return;
                    } else {
                      console.log(`'${filePath}' uploaded to ${params.Bucket}`);
                    }
                  });
                }
              }
            })
          }
        })

      })
    })

    // Large CFN templates must be uploaded to S3 before they can be applied
    glob(cwd + `/artifacts/cloudformation/*.${region.Id}.template`, function(err, files) {
      files.forEach(function(file){
        fs.stat(file, function(err, stats){
          if (stats.size > MAX_CFN_SIZE) {
            // We found a large template, now upload it to S3...
            var fileName = path.basename(file);

            fs.readFile(file, function(err, data){
              if(err){
                console.log(`Error reading file '${fileName}'`)
                return;
              } else {
                var params = {
                  Bucket: region.ArtifactsBucket,
                  Key: `cloudformation/${fileName}`,
                  StorageClass: 'STANDARD',
                  Body: data
                };
                S3.putObject(params, function(err, data){
                  if(err) {
                    console.log(`Error uploading '${fileName}' to S3: ${err}`);
                    return;
                  } else {
                    console.log(`'${fileName}' uploaded to S3`);
                  }
                });
              }
            })
          }
        });
      });
    });
  });
}

module.exports = sync;