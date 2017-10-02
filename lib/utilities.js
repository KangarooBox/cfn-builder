// NPM
var fs    = require('fs');
var _     = require('lodash');
var util  = require('util');
var aws   = require('aws-sdk');

// Local
var processTemplate = require('./process-template');


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

/*
 * Export constants
 */
exports.GLOBALS = exports.processBlueprint("./blueprints/common/globals.hbs");
exports.REGIONS = exports.GLOBALS.Regions;
exports.AWS     = aws;