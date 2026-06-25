// deno-lint-ignore-file
'use strict';

const fs       = require('fs-extra');
const path     = require('path');
const hbs      = require('handlebars');
const swag     = require('swag');
const UglifyJS = require('uglify-js');

// Compile an HBS template into JSON
function processTemplate(tmpl, context) {
  var template = hbs.compile(tmpl.toString());
  return template(context);
}

// Register HBS partials
function registerPartials(filepath) {
  if (fs.existsSync(filepath)) {
    var files = fs.readdirSync(filepath);
    for(var index in files){
      var data = fs.readFileSync(filepath+"/"+files[index]);
      var partial_name = path.basename(files[index], ".hbs");
      hbs.registerPartial(partial_name, data.toString());
    }
  }
}

// The SWAG library has a lot of really neat helpers to do
// things like if/then/else logic, sting manipulation, counting, etc.
swag.registerHelpers(hbs);

// Unwrap a CloudFormation `Fn::Sub` intrinsic to its literal template string
// so swag's string helpers can operate on it. Accepts both forms:
//   { "Fn::Sub": "foo-${BAR}" }                       -> "foo-${BAR}"
//   { "Fn::Sub": ["foo-${BAR}", { BAR: "x" }] }       -> "foo-${BAR}"
// Anything else is returned unchanged.
function unwrapCfn(value) {
  if (value && typeof value === 'object' && 'Fn::Sub' in value) {
    var sub = value['Fn::Sub'];
    return Array.isArray(sub) ? sub[0] : sub;
  }
  return value;
}

// Define our custom helpers
var helpers = {
  /**
   * {{comma}}
   *
   * Insert comma between elements in a list, except the last element
   *
   * @example
   *   {{#each bigListOfThings}}
   *    { "Name": "{{this}}" }{{comma)}}
   *   {{/each}}
   */
  comma: function () {
    var arg = Array.prototype.slice.call(arguments,0);
    return arg[0].data.last ? "" : ",";
  },

  /**
   * {{concat}}
   *
   * Join arguments together into one string.
   *
   * @example
   *    {{> (concat "cfn_init_" this.AMI)}}
   */
  concat: function () {
    var arg = Array.prototype.slice.call(arguments,0);
    arg.pop();
    return arg.join('');
  },

  /**
   * {{contains}}
   *
   * Render something if the specified value is in the array, object, or string.
   *
   * @example
   *    {{#contains this "my string"}}Found it!{{else}}It's not here{{/contains}}
   */
  contains: function(collection, item, options) {
    // string check
    if( typeof collection === 'string' ){
      if( collection.search( item ) >= 0 ){
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    }
    // "collection" check (objects & arrays)
    for( var prop in collection ){
      if( collection.hasOwnProperty( prop ) ){
        if( collection[prop] == item ) return options.fn(this);
      }
    }
    return options.inverse(this);
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
   * {{ifArray}}
   *
   * Determine if an element is an array
   *
   * @example
   *   {{#ifArray this}}
   *     { {{{inject this}}} }
   *   {{/ifArray}}
   *
   */
  ifArray: function (elem, options) {
    if(typeof elem === "object" && elem.isArray) {
      return options.fn(this);
    }
    return options.inverse(this);
  },

  /**
   * {{ifObject}}
   *
   * Determine if an element is an object
   *
   * @example
   *   {{#ifObject this}}
   *     { {{{inject this}}} }
   *   {{/ifObject}}
   *
   */
  ifObject: function (elem, options) {
    if(typeof elem === "object") {
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
    var blueprintsDir = context && context.data && context.data.root && context.data.root.__blueprintsDir__;
    var resolvedFile = blueprintsDir ? path.resolve(blueprintsDir, file) : file;
    var f = fs.readFileSync(resolvedFile);
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
    var blueprintsDir = context && context.data && context.data.root && context.data.root.__blueprintsDir__;
    var resolvedFile = blueprintsDir ? path.resolve(blueprintsDir, file) : file;
    var f = fs.readFileSync(resolvedFile);
    return JSON.stringify(processTemplate(f, context));
  },

  /**
   * {{inject}}
   *
   * Inject "raw" JSON into a template.  This comes in handy when
   * you want to place things like IAM Policy Documents into
   * templates without having to stringify the entire thing
   *
   * @param  {[bool]} escape    [escape the JSON into a string]
   *
   * @example
   *   "Type" : "AWS::IAM::Policy",
   *   "Properties" : {
   *      ...
   *      "PolicyDocument" : { {{{inject this.Document}}} }
   *      ...
   *   }
   */
  inject: function (context, escape = false) {
    var string = JSON.stringify(context, null, null).slice(1, -1);

    if (true == escape){
      string = JSON.stringify(string, null, null).slice(1, -1);
    }

    return string;
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
  lookupByKey: function (collection, key, value) {
    var collectionLength = collection.length;
    for (var i = 0; i < collectionLength; i++) {
      if (collection[i][key] === value) {
        return collection[i];
      }
    }
    return null;
  },

  lookupByAZ: function (collection, az){
    return helpers.lookupByKey(collection, 'AZ', az);
  },
  lookupById: function (collection, id) {
    return helpers.lookupByKey(collection, 'Id', id);
  },
  lookupByName: function (collection, name) {
    return helpers.lookupByKey(collection, 'Name', name);
  },
  lookupByNode: function(collection, node){
    return collection[node];
  },

  /**
   * {{includeJavascript}}
   *
   * Inject Javascript into a template as a string.  This comes
   * in handy when you want to insert Javascript into a template, as in
   * a Cloudfront function.
   *
   */
  includeJavascript: function (file, context) {
    var blueprintsDir = context && context.data && context.data.root && context.data.root.__blueprintsDir__;
    var resolvedFile = blueprintsDir ? path.resolve(blueprintsDir, file) : file;
    var source = fs.readFileSync(resolvedFile, 'utf8');
    var result = UglifyJS.minify(source);
    if (result.error) throw new Error('includeJavascript: ' + result.error);
    return result.code.replace(/"/g, '\\"');
  },

 /**
   * {{{{raw}}}}
   *
   * Don't interpret the contents of this block as a mustach command.
   *
   * @example
   *  {
   *     ...
   *     "MasterUserPassword" : "{{{{raw}}}}{{resolve:ssm-secure:MyPassword:2}}{{{{/raw}}}}",
   *     ...
   *   },
   */
  raw: function (options) {
    return options.fn(this);
  },


  /**
   * {{sanitize}}, {{lowercase}}, {{uppercase}}
   *
   * Override swag's string helpers so they also accept a CloudFormation
   * `Fn::Sub` intrinsic. Plain strings behave exactly like swag's helpers;
   * `{ "Fn::Sub": "..." }` (or the array form) is unwrapped to its literal
   * template string first. For `sanitize`, that means `${VAR}` placeholders
   * are stripped along with every other non-alphanumeric character.
   *
   * @example
   *   {{sanitize this.Name ''}}
   *   // "123-${BLAH}-test"             -> "123BLAHtest"
   *   // {"Fn::Sub": "123-${BLAH}-test"} -> "123BLAHtest"
   *
   *   {{lowercase this.Name}}
   *   // {"Fn::Sub": "FOO-${BAR}"}       -> "foo-${bar}"
   */
  sanitize: function (str, replaceWith) {
    var replacement = typeof replaceWith === 'string' ? replaceWith : '-';
    return String(unwrapCfn(str)).replace(/[^a-z0-9]/gi, replacement);
  },

  lowercase: function (str) {
    return String(unwrapCfn(str)).toLowerCase();
  },

  uppercase: function (str) {
    return String(unwrapCfn(str)).toUpperCase();
  },

  truncate: function (str, length, omission) {
    var suffix = typeof omission === 'string' ? omission : '';
    var value = String(unwrapCfn(str));
    if (value.length > length) {
      return value.substring(0, length - suffix.length) + suffix;
    }
    return value;
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
   * {{split}}
   * @author: https://github.com/dhollenbeck
   *
   * Splits a string into an array
   *
   * @example:
   *   {{> myPartial test=(split 'hello;world' ';') }}
   */
  split: function (str, options) {
    return str.split(options);
  },


  /**
   * {{switch/case/sdefault}}
   * @author: Chris Montrois
   * @original: http://chrismontrois.net/2016/01/30/handlebars-switch/
   *
   * Allows the use of switch/case statements instead of nested if/then/else
   *
   * NOTE: the "sdefault" option must be first
   *
   * @example:
   *   {{#switch this.Protocol}}
   *     {{#sdefault}}Default things go here{{/sdefault}}
   *     {{#case "email" break=true}}Do Email Things{{/case}}
   *     {{#case "sqs" break=true}}Do SQS Things{{/case}}
   *   {{/switch}}
   */
  switch: function(value, options) {
    this._switch_value_ = value;
    this._switch_break_ = false;
    var html = options.fn(this);
    delete this._switch_break_;
    delete this._switch_value_;
    return html;
  },
  case: function(value, options) {
    var args = Array.prototype.slice.call(arguments);
    var options    = args.pop();
    var caseValues = args;

    if (this._switch_break_ || caseValues.indexOf(this._switch_value_) === -1) {
      return '';
    } else {
      if (options.hash.break === true) {
        this._switch_break_ = true;
      }
      return options.fn(this);
    }
  },
  sdefault: function(options) {
    if (!this._switch_break_) {
      return options.fn(this);
    }
  },


  /**
   * {{toJsonString <value>}}
   *
   * Convert JSON to a string. This is useful for JSON parameters that need
   * to be provided to CFN as a string.
   *
   * @example
   *   "Input": {{toJsonString this.Input}}
   */
  toJsonString: function (value) {
    return JSON.stringify(value);
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
  },


  /**
   * {{whichPartial <field_name> <prefix> <context>}}
   *
   * Return the partial that starts with the prefix and ends with the context, if found.
   *
   * @examples
   *   {{> (whichPartial "AMI" "my_prefix_" this) }}
   *   {{> (whichPartial . this.name '_environment') }}
   */
  whichPartial: function (field_name, prefix, context) {
    if(typeof context === "object") {
      var partial_name = prefix+context[field_name];
    } else {
      var partial_name = prefix+context;
    }
    var ret_value = prefix+"null";
    if (undefined != hbs.partials[partial_name]){
      // We found a partial by that name!
      ret_value = partial_name;
    }

    return ret_value;
  }
};

// Register the helpers with HBS.
for (var helper in helpers){
  if (helpers.hasOwnProperty(helper)){
    hbs.registerHelper(helper, helpers[helper]);
  }
}


// Register any partials
registerPartials(__dirname + "/../blueprints/common/partials");
registerPartials(process.cwd() + "/../partials");
registerPartials(process.cwd() + "/blueprints/partials");


module.exports = processTemplate;
