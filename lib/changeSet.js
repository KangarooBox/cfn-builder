// NPM
var util  = require('util');
var _     = require('lodash');

// Local
var utilities = require("./utilities");

function decodeRegionId(changeSet){
  return _.split(changeSet.ChangeSetId, ':')[3];
}

module.exports = {
  create: function(envName, projectName) {
    return new Promise(function(fulfill, reject){
      utilities.REGIONS.forEach(function(region){
        try {
          var templateName = utilities.buildTemplateName(projectName, envName, region.Id);
          var json = utilities.loadTemplate(templateName);
          var CFN = new utilities.AWS.CloudFormation({apiVersion: '2010-05-15', region: region.Id});

          var params = {
            StackName: utilities.buildStackName(projectName, envName, region.Id),
            ChangeSetName: util.format("cs-%s", _.now()),
            TemplateBody: JSON.stringify(json),
            Capabilities: [ "CAPABILITY_NAMED_IAM" ]
            // TemplateURL: 'STRING_VALUE'
          };

          console.log("Creating change set for '%s'...", templateName);
          CFN.createChangeSet(params).promise()
          .then(function(changeSet){
            CFN.waitFor('changeSetCreateComplete', { ChangeSetName: changeSet.Id }).promise()
            .then(function(data){
              // The ChangeSet has been created successfully
              fulfill(data);
            })
            .catch(function(err){
              // The ChangeSet didn't get created for some reason, perhaps because there are no changes
              console.log("ChangeSet '%s' not created:\n\t%s", changeSet.Id, err);
              CFN.deleteChangeSet({ ChangeSetName: changeSet.Id }).promise()
              .then(function(data){
                // The failed ChangeSet has been removed
                // fulfill(util.format("ChangeSet cleanup complete: %s", changeSet.Id));
                fulfill(changeSet);
              })
              .catch(function(err){
                // The failed ChangeSet has not been removed
                reject(err);
              })
            })
          })
          .catch(function(err){
            reject(util.format("Error creating ChangeSet: %s", err));
          })
        } catch(err) {
          // If the error code is 'ENOENT' then this region doesn't have a template so we can ignore the error
          if (err.code != 'ENOENT') { reject(err); }
        }
      });
    });
  },

  execute: function(changeSet) {
    var regionId = decodeRegionId(changeSet);
    var CFN = new utilities.AWS.CloudFormation({apiVersion: '2010-05-15', region: regionId});

    return new Promise(function(fulfill, reject){
      CFN.executeChangeSet({ChangeSetName: changeSet.ChangeSetId}).promise()
      .then(function(data){
        CFN.waitFor('stackUpdateComplete', {StackName: changeSet.StackName}).promise()
        .then(function(data){
          fulfill("Changeset update complete.");
        })
        .catch(function(err){
          reject(err);
        })
      })
      .catch(function(err){
        reject(err);
      });
    });
  },

  delete: function(changeSet) {
    var regionId = decodeRegionId(changeSet);
    var CFN = new utilities.AWS.CloudFormation({apiVersion: '2010-05-15', region: regionId});
    return CFN.deleteChangeSet({ChangeSetName: changeSet.ChangeSetId}).promise();
  }
}
