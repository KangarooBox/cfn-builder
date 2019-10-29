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
var CFN;

var logger = {};
logger.log = function(msg){ console.log(`${msg}`.green); };
logger.warn = function(msg){ console.log(`WARN: ${msg}`.yellow); };
logger.error = function(msg){
  console.error(`ERROR: ${msg}`.brightRed);
  process.exitCode = ERROR;
};

class ChangeSet {
  constructor(cwd, args){
    this.envName      = args.envName;
    this.projectName  = args.projectName;
    this.region       = args.region;
    this.isUnattended = args.unattended;
    this.CFN = new utilities.AWS.CloudFormation({apiVersion: '2010-05-15', region: args.region});
  }

  async create() {
    try {
      var templateName = utilities.buildTemplateName(this.projectName, this.envName, this.region);
      var fileName = "./artifacts/cloudformation/" + templateName;
      var template = fs.readFileSync(fileName, 'ascii');
      var templateObject = JSON.parse(template);
      var params = {
        StackName: utilities.buildStackName(this.projectName, this.envName, this.region),
        ChangeSetName: util.format("cs-%s", _.now()),
        TemplateBody: template,
        Capabilities: [ "CAPABILITY_NAMED_IAM" ]
        // TemplateURL: 'STRING_VALUE'
      };
    } catch(err) {
      switch(err.code) {
        case 'ENOENT':
          logger.error(`Can't find a template named '${fileName}'`);
          break;

        default:
          logger.error(`Unknown error: ${err.message}`);
      }
      return;
    }

    // Add Stack tags, if present
    if (templateObject.Metadata.Tags) {
      params.Tags = templateObject.Metadata.Tags
    }

    var changeSet;
    var isComplete;

    // Try to create the ChangeSet...
    try {
      logger.log(`Creating ChangeSet for '${templateName}'...`);
      changeSet = await this.CFN.createChangeSet(params).promise();
      isComplete = await this.CFN.waitFor('changeSetCreateComplete', {$waiter: {delay: 2, maxAttempts: 200}, ChangeSetName: changeSet.Id }).promise();
    } catch (err) {
      // The ChangeSet didn't get created properly for some reason, perhaps because there are no changes
      try {
        const describe = await this.CFN.describeChangeSet({ChangeSetName: changeSet.Id}).promise();
        this.deleteChangeSet(changeSet);
        logger.warn(`ChangeSet status '${describe.Status}' - ${describe.StatusReason}`);
      } catch (err) {
console.log(err);
        logger.error(`ChangeSet '${changeSet.Id}' not created: ${err.message} and it wasn't cleaned up properly.`);
      }
      return;
    }

    // Something good happened, now determine what that was and how to proceed
    switch(typeof (isComplete)) {
      // We got back a string which is probably a status update
      case 'string':
        logger.warn(isComplete);
        break;

      // We got back a CFN object, do something with it
      case 'object':
        if(isComplete.ChangeSetId) {
          try {
            await this.shouldWeDeploy(isComplete);

            try {
              const execute = await this.CFN.executeChangeSet({ChangeSetName: changeSet.Id}).promise();
              const isComplete = await this.CFN.waitFor('stackUpdateComplete', {$waiter: {delay: 2, maxAttempts: 100}, StackName: changeSet.StackId }).promise();
            } catch(err){
              logger.error(`ChangeSet has not been executed: ${err.message}`);

              // The ChangeSet failed to execute properly.  Let's show the user why it failed, similar
              // to the display in the AWS CFN console.
              try {
                var result = await this.CFN.describeStackEvents({StackName: changeSet.StackId}).promise();
                this.printEvents(result.StackEvents);
                this.deleteChangeSet(changeSet);
              } catch(err){
                logger.warn(`could not display event details: ${err.message}`);
              }
            }

            // Update the Stack Policy after executing the ChangeSet.  This way, you have to manually
            // remove/change the Stack Policy before the ChangeSet will execute.  And if/when you do
            // change the Stack Policy this will force it back in place.
            if (templateObject.Metadata.StackPolicyBody) {
              var newPolicy = templateObject.Metadata.StackPolicyBody
              try {
                await this.CFN.setStackPolicy({
                  StackName: changeSet.StackId,
                  StackPolicyBody: JSON.stringify(newPolicy)
                }).promise();
              } catch(err) {
                logger.error(`Failed to set stack policy: ${err.message}`);
                break;
              }
            }

          } catch {
            this.deleteChangeSet(changeSet);
          }
        }
        break;

      // We don't know what we got back
      default:
        logger.error(`Unknown return from createChangeSet: ${isComplete}`);
        this.deleteChangeSet(changeSet);
    }

  }

  async deleteChangeSet(changeSet){
    try {
      await this.CFN.deleteChangeSet({ChangeSetName: changeSet.Id}).promise();
      logger.log("ChangeSet has been removed.");
    } catch(err) {
      logger.error(`ChangeSet has NOT been removed: ${err.message}`);
    }
  }


  // Ask the user if we should deploy or not.  This is a bit more complex than just asking
  // because if this is an 'unattended' deploy we have to automatically make a decision.
  shouldWeDeploy(cs) {
    var isSafe = utilities.isSafeToApplyChangeSet(cs);
    var isUnattended = this.isUnattended;

    this.showChanges(cs);

    return new Promise(function(fulfill, reject){
      // if this is a SAFE change then either apply it automatically or ask the user what to do
      if(isSafe){
        if (isUnattended) { fulfill(true); } else {
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
        if (isUnattended) { reject(false); } else {
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


  // Print the CFN events in a nice looking format
  printEvents(events) {
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
        new Date(event.Timestamp).toLocaleString(),
        event.LogicalResourceId,
        style(event.ResourceStatus),
        event.ResourceStatusReason
      ]);
    })

    console.log(table.toString());
  }


  // Display the proposed stack changes in a nice, neat, table format
  showChanges(cs) {
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
}

module.exports = ChangeSet;
