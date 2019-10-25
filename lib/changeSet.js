// NPM
var fs    = require('fs');
var util  = require('util');
var _     = require('lodash');
var Table   = require('cli-table3');
var colors  = require('colors');
var prompts = require('prompts');

// Local
var utilities = require("./utilities");
const SAFE    = 20;
const UNSAFE  = 21;
const ERROR   = 22;
process.exitCode = SAFE;

var logger = {};
logger.log = function(msg){ console.log(`${msg}`.green); };
logger.warn = function(msg){ console.log(`WARN: ${msg}`.yellow); };
logger.error = function(msg){
  console.error(`ERROR: ${msg}`.red);
  process.exitCode = ERROR;
};

async function changeSet(cwd, args) {
  var envName     = args.envName;
  var projectName = args.projectName;
  var region      = args.region;
  var templateName = utilities.buildTemplateName(projectName, envName, region);
  var fileName = "./artifacts/cloudformation/" + templateName;
  var template = fs.readFileSync(fileName, 'ascii');
  var templateObject = JSON.parse(template);
  var CFN = new utilities.AWS.CloudFormation({apiVersion: '2010-05-15', region: region});
  var params = {
    StackName: utilities.buildStackName(projectName, envName, region),
    ChangeSetName: util.format("cs-%s", _.now()),
    TemplateBody: template,
    Capabilities: [ "CAPABILITY_NAMED_IAM" ]
    // TemplateURL: 'STRING_VALUE'
  };


  // Add Stack tags, if present
  if (templateObject.Metadata.Tags) {
    params.Tags = templateObject.Metadata.Tags
  }

  try {
    logger.log(`Creating change set for '${templateName}'...`);
    const changeSet = await CFN.createChangeSet(params).promise();
    const isComplete = await CFN.waitFor('changeSetCreateComplete', {$waiter: {delay: 2, maxAttempts: 200}, ChangeSetName: changeSet.Id }).promise();

    switch(typeof (isComplete)) {
      // We got back a string which is probably a status update
      case 'string':
        logger.warn(isComplete);
        break;

      // We got back a CFN object, do something with it
      case 'object':
        if(isComplete.ChangeSetId) {
          try {
            await shouldWeDeploy(isComplete, args);

            try {
              const execute = await CFN.executeChangeSet({ChangeSetName: changeSet.Id}).promise();
              const isComplete = await CFN.waitFor('stackUpdateComplete', {$waiter: {delay: 2, maxAttempts: 100}, StackName: changeSet.StackId }).promise();
            } catch(err){
              logger.error(`ChangeSet has not been executed: ${err.message}`);

              try {
                var result = await CFN.describeStackEvents({StackName: changeSet.StackId}).promise();
                printEvents(result.StackEvents);
              } catch(err){
                logger.warn(`could not display event details: ${err.message}`);
              }
            }

          } catch(err){
            // We didn't deploy for some reason, clean up everything
            try {
              await CFN.deleteChangeSet({ChangeSetName: changeSet.Id}).promise();
              logger.log("ChangeSet has been removed.");
            } catch(err) {
              logger.error(`ChangeSet has NOT been removed: ${err.message}`);
            }

          }
        }
        break;

      // We don't know what we got back
      default:
        logger.error(`Unknown return from createChangeSet: ${isComplete}`);
    }

  } catch (err) {
    // The ChangeSet didn't get created for some reason, perhaps because there are no changes
    logger.log(`ChangeSet '${changeSet.Id}' not created: ${err.message}`);
  }
}


// Print the CNF events in a nice looking format
function printEvents(events) {
  var table = new Table({
    head: ['Timestamp', 'Logical ID', 'Status', 'Reason'],
    colWidths: [25,25,30,45],
    wordWrap: true,
    style: { head:[] }
  });

  // limit the number of events to show
  events.length = Math.min(events.length, 7);

  _.each(events, function(event){
    if (!event.ResourceStatusReason) { event.ResourceStatusReason = '' };

    var style = null;

    switch (event.ResourceStatus) {
      case 'UPDATE_FAILED':
      case 'UPDATE_ROLLBACK_COMPLETE':
      case 'UPDATE_ROLLBACK_IN_PROGRESS':
      case 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS':
        style = colors.red;
        break;
      case 'UPDATE_COMPLETE':
        style = colors.green;
        break;
      case 'UPDATE_IN_PROGRESS':
        style = colors.blue;
        break;
      default:
        style = colors.white;
    }
    table.push([
      style(new Date(event.Timestamp).toLocaleString()),
      style(event.LogicalResourceId),
      style(event.ResourceStatus),
      style(event.ResourceStatusReason)
    ]);
  })

  console.log(table.toString());
}


// Print the changes that will be executed by the ChangeSet
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


// Ask the user if we should deploy or not.
function shouldWeDeploy(cs, args) {
  printTable(cs);

  var isSafe = utilities.isSafeToApplyChangeSet(cs);

  return new Promise(function(fulfill, reject){
    // if this is a SAFE change then either apply it automatically or ask the user what to do
    if(isSafe){
      if (args.unattended) { fulfill(true); } else {
        (async () => {
          const response = await prompts({
            type: 'confirm',
            name: 'deploy',
            message: "Would you like to deploy this ChangeSet?".green,
            initial: true
          })
          if (response.deploy) { fulfill(true); } else { reject(false); }
        })();
      }
    } else {
      process.exitCode = UNSAFE;
      // This is an UNSAFE change so we need to confirm that they actually want to deploy it
      if (args.unattended) { reject(false); } else {
        (async () => {
          const response = await prompts({
            type: 'confirm',
            name: 'deploy',
            message: "This ChangeSet is NOT safe to deploy.  Are you sure you want to deploy this ChangeSet?".red,
            initial: false
          });
          if (response.deploy) { fulfill(true); } else { reject(false); }
        })();
      }
    }
  })
}

module.exports = changeSet;
