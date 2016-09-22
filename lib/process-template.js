"use strict";

var async = require("async");
var fs = require("fs-extra");
var path = require("path");
var hbs = require("handlebars");
var swag = require("swag");

// Compile an HBS template into JSON
function processTemplate(tmpl, args) {
  var template = hbs.compile(tmpl.toString());
  return template(args);
}


// The SWAG library has a lot of really neat helpers to do
// things like if/then/else logic, sting manipulation, counting, etc.
swag.registerHelpers(hbs);

// Define our custom helpers
var helpers = {
  /**
   * {{alphaNumeric}}
   *
   * Remove all 'weird' characters from a string, leaving only
   * alpha and numeric characters.
   *
   * @example
   *
   */
  alphaNumeric: function (str) {
    return string.replace(/[^A-Za-z0-9]/g, "");
  },

  /**
   * {{ENV}}
   *
   * Return an environment variable and place it into a template.  This
   * is useful for things that change between runs or stuff that you
   * don't want to store in a blueprint (i.e. passwords).
   */
  ENV: function (str) {
    return process.env[str];
  },

  /**
   * {{findAMI}}
   *
   * Locate a given AMI in the global array of AMIs.  IF the AMI is a raw
   * id (ami-1231234) then return the AMI.
   *
   * @example
   *   "ImageId" : "{{findAMI @root.AMI @root.Region.AMIs}}"
   *
   */
  findAMI: function (ami, context) {
    if(ami.startsWith('ami-')) {
      return ami;
    } else {
      return context[ami];
    }
  },

  /**
   * {{ifEq}}
   *
   * Determine if a string is equal to another string
   *
   * @example
   *   {{#ifEq this "some_string"}}
   *      "Yes, I'm equal!"
   *   {{else}}
   *      "Boo, I'm not the same"
   *   {{/ifEq}}
   *
   */
  ifEq: function (a, b, opts) {
    if(a === b){
      return opts.fn(this);
    } else {
      return opts.inverse(this);
    }
  },

  /**
   * {{ifIn}}
   *
   * Determine if a string is contained within a list
   *
   * @example
   *
   */
  ifIn: function (elem, list, options) {
    if(list.indexOf(elem) > -1) {
      return options.fn(this);
    }
    return options.inverse(this);
  },

  /**
   * {{include}}
   *
   * Render a HBS template and include it in the parent template as JSON.
   *
   * @example
   * "Regions" : [
   *   { "Id" : "us-east-1",
   *     ...
   *     "AMIs" : {{{include 'blueprints/common/AMIs.us-east-1.json'}}},
   *     ...
   *   },
   */
  include: function (file, context) {
    var f = fs.readFileSync(file);
    return processTemplate(f, context);
  },

  /**
   * {{includeAsString}}
   *
   * Render a HBS template and include it in the parent template
   * as a string instead of JSON.
   *
   * @example
   * "Regions" : [
   *   { "Id" : "us-east-1",
   *     ...
   *     "AMIs" : {{{include 'blueprints/common/AMIs.us-east-1.json'}}},
   *     ...
   *   },
   */
  includeAsString: function (file, context) {
    var f = fs.readFileSync(file);
    return JSON.stringify(processTemplate(f, context));
  },


  /**
   * {{inject}}
   *
   * Inject "raw" JSON into a template.  This comes in handy when
   * you want to place things like IAM Policy Documents into
   * templates without having to stringify the entire thing
   *
   * @example
   *   "Type" : "AWS::IAM::Policy",
   *   "Properties" : {
   *      ...
   *      "PolicyDocument" : { {{{inject this.Document}}} }
   *      ...
   *   }
   */
  inject: function (context) {
    return JSON.stringify(context, null, null).slice(1, -1);
  },

  /**
   * {{lookupById}}
   *
   * Find an item in a collection by it's "Id"
   *
   * @example
   *   {{#with (lookupById @root.DNS @root.Route53::RecordSet.External.Domain)}}
   *
   *
   */
  lookupById: function (collection, id) {
    var collectionLength = collection.length;
    for (var i = 0; i < collectionLength; i++) {
      if (collection[i].Id === id) {
        return collection[i];
      }
    }
    return null;
  },

  lookupByName: function (collection, name) {
    var collectionLength = collection.length;
    for (var i = 0; i < collectionLength; i++) {
      if (collection[i].Name === name) {
        return collection[i];
      }
    }
    return null;
  },

  lookupByNode: function(collection, node, opts){
    return collection[node];
  },

  blah: function(template, opts){
    return this.processTemplate(template, opts);
  },


  /**
   * {{startsWith}}
   * @author: Dan Fox <http://github.com/iamdanfox>
   *
   * Tests whether a string begins with the given prefix.
   * Behaves sensibly if the string is null.
   * @param  {[type]} prefix     [description]
   * @param  {[type]} testString [description]
   * @param  {[type]} options    [description]
   * @return {[type]}            [description]
   *
   * @example:
   *   {{#startsWith "Goodbye" "Hello, world!"}}
   *     Whoops
   *   {{else}}
   *     Bro, do you even hello world?
   *   {{/startsWith}}
   */
  startsWith: function (prefix, str, options) {
    if ((str != null ? str.indexOf(prefix) : void 0) === 0) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  },

  /**
   * {{toString <value>}}
   *
   * Convert a value to a string.  This is useful for boolean values
   * which more often than not have problems in expressions.
   *
   * @example
   *   "SourceDestCheck":{{default (toString this.SourceDestCheck) true}}
   */
  toString: function (value) {
    return ( value === void 0 ) ? "" : value.toString();
  }

};

// Register the helpers with HBS.
for (var helper in helpers){
  if (helpers.hasOwnProperty(helper)){
    hbs.registerHelper(helper, helpers[helper]);
  }
};



// Register any partials
fs.readdir(__dirname + "/../blueprints/common/partials", function(err, files) {
  if (err) {
    console.error("failed to find partials directory : " + err);
  }

  // Filter each file to make sure its a template and then process it in its own thread
  async.each(files, function(file, callback) {
    fs.readFile(__dirname + "/../blueprints/common/partials/"+file, function(err, data) {
      if (err) {
        console.error("failed to read partial '"+file+"': "+err);
      } else {
        var partial_name = path.basename(file, ".hbs");
        hbs.registerPartial(partial_name, data.toString());
      }
    });
  });
});

module.exports = processTemplate;