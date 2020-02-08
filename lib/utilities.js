// NPM
const fs    = require('fs');
const _     = require('lodash');
const util  = require('util');
const aws   = require('aws-sdk');

// Local
const processTemplate = require('./process-template');


/*
 * Export functions
 */
exports.processBlueprint = function(blueprint){
  try {
    return JSON.parse(processTemplate(fs.readFileSync(blueprint)));
  } catch(err){
    throw err;
  }
};


exports.buildTemplateName = function(projectName, envName, region) {
  var name = _.join([projectName, envName, region, 'template'], '.');
  return (name).toLowerCase();
};


exports.buildStackName = function(projectName, envName, region) {
  var ret = null;
  try {
    var templateName = exports.buildTemplateName(projectName, envName, region);
    var template = exports.loadTemplate(templateName);
    var version = template.Metadata.Version ? template.Metadata.Version : '';
    ret = util.format("%s-%s%s", template.Metadata.ProjectName, version, template.Metadata.Environment);
  } catch(err) {
    console.log(`Couldn't build a stack name: ${err}`);
  }
  return ret;
}


exports.loadTemplate = function(templateName) {
  return exports.processBlueprint(util.format("./artifacts/cloudformation/%s", templateName));
}

// Make sure that the ChangeSet doesn't include any changes that might remove or replace existing resources
exports.isSafeToApplyChangeSet = function(changeSet){
  var isSafe = _.reduce(changeSet.Changes, function(result, value, key){
    if("Resource" === value.Type) {
      switch(value.ResourceChange.Action) {
      case "Add":
        return result.concat(true);
        break;
      case "Modify":
        if("False" === value.ResourceChange.Replacement) {
          return result.concat(true);
        } else {
          return result.concat(false);
        }
        break;
      case "Remove":
        return result.concat(false);
        break;
      default:
        console.log("Unknown action %s", value.ResourceChange.Action);
        return result.concat(false);
      }
    }
  }, []);

  return (!(_.includes(isSafe, false)));
}

// Parse CLI arguments
exports.parseArguments = function(bare){
  var argv = require('yargs')
      .usage('Usage: $0 [options]')
      // .demandOption(['environment','project'])
      .option('stack', {
        description: 'Stack name',
        alias: 's',
        type: 'string',
        conflicts: ['environment', 'project']
      })
      .option('environment', {
        description: 'Environment name',
        alias: 'e',
        type: 'string',
        implies: 'project'
      })
      .option('project', {
        description: 'Project name',
        alias: 'p',
        type: 'string',
        implies: 'environment'
      })
      .option('region', {
        description: 'Region',
        example: 'us-east-1',
        alias: 'r',
        type: 'string',
        default: 'us-east-1',
        demandOption: true
      })
      .option('profile', {
        description: 'AWS profile',
        alias: 'pr',
        type: 'string'
      })
      .option('unattended', {
        description: 'Don\'t prompt for confirmation',
        alias: 'u'
      })
      .check(function(argv, options){
        if(bare || ((argv.stack) || (argv.project && argv.environment))){
          return true;
        } else {
          return "You must specify either the Stack name or the Environment name and Project name.";
        }
      })
      .argv;

  var envName = argv.environment;
  var projectName = argv.project;
  var region = argv.region;
  var unattended = argv.unattended;

  // Decode the project name and environment name, if the Stack name is supplied
  if(argv.stack){
    projectName = argv.stack.substr(0, argv.stack.indexOf('-'));
    envName = argv.stack.substr(argv.stack.indexOf('-')+2);
  }

  // Set the AWS profile, if available
  if (argv.profile) { process.env.AWS_PROFILE=argv.profile }

  return {envName, projectName, region, unattended}
}

exports.parseProfileArgument = function(){
  var argv = require('yargs')
      .usage('Usage: $0 [options]')
      .option('profile', {
        description: 'AWS profile',
        alias: 'pr',
        type: 'string'
      })
      .argv;

  // Set the AWS profile, if available
  if (argv.profile) { process.env.AWS_PROFILE=argv.profile }
}

/*
 * Export constants
 */
exports.GLOBALS = exports.processBlueprint("./blueprints/common/globals.hbs");
exports.REGIONS = exports.GLOBALS.Regions;
exports.AWS     = aws;