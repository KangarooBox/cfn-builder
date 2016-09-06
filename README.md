# cfn-builder

cfn-builder is a NodeJS command line application that will convert your JSON "blueprints" to an
AWS CloudFormation template.

## Introduction

The idea behind this project is to create a small number of JSON & Handlebars (.hbs) files (aka Blueprints) that
can be compiled into a larger number of CF templates.  Each project has multiple JSON files
describing a particular environment (i.e. Prod, QA, Dev) which is then compiled against a general blueprint
which results in a CloudFormation template that can be executed.

## Dependencies

* Node.js / npm

## Installing

Install cfn-builder from NPM using the following command line:

    npm -g install cfn-builder

## Testing

N/A (so far)

## Blueprint Breakdown

Here is a breakdown of the parts of a blueprint.  It's not as complex as it first seems and not all
sections are required.

*NOTES:*

* Almost everything is case sensitive:  "MyProject" != "myProject"
* CloudFormation hates long identifiers so try to keep IDs/Names short (<10 characters)
* All of your blueprints must be valid JSON.  If you have a loop ({{#each}}) then make sure you end it with
something like ```{{#unless @last}},{{/unless}}``` so that you don't have any trailing commas.


## Usage

### Create the proper directory structure

cfn-builder expects certain files to be in a certain directory structure.  Under the root directory there should be a
'blueprints' directory.  This directory contains all of the cnf-builder specific files.  Inside the 'blueprints'
directory there should be two other directories: 'common' & 'stacks'.  The 'common' directory contains blueprints that
are used in multiple stacks, such as ``globals.hbs`` and ``live.hbs``.  The 'stacks' directory contains blueprints that
describe a particular CFN stack, such as the one for a VPC or a project.  An example directory structure is listed here:

    .../my-project
         /blueprints
           /common
             globals.hbs
             stage.hbs
             live.hbs
           /stacks
             my-project.stage.hbs
             my-project.live.hbs


### Create a globals file:  ``.../blueprints/globals.hbs``

The ``globals.hbs`` file is used to specify things that don't change between environments.  This includes
things like IPAddresses and region information.  An example ``globals.hbs`` file is listed here:

    {
      "IPAddresses": {
        "MyOffice"   : ["123.123.123.123/32"],
        "Github"     : ["192.30.252.0/22"]
      },

      "Regions" : [
        { "Id" : "us-east-1",
          "AvailabilityZones" : [ "b", "c", "d", "e" ],
          "AMIs" : {{{include 'templates/common/AMIs.us-east-1.json'}}}
        },
        { "Id" : "us-west-2",
          "AvailabilityZones" : [ "a", "b", "c" ],
          "AMIs" : {{{include 'templates/common/AMIs.us-west-2.json'}}}
        }
      ]
    }

### Create an environment file: ``.../blueprints/common/stage.hbs``

The environment blueprints are used to specify things that do change between environments.  This includes
things like VPC ids, CIDR blocks, and subnet information.  An example environment file is listed here:

      "EnvType" : "stage",
      "EnvVersion" : "a",

      "EnvRegions" : [
        {
          "Id" : "us-east-1",
          "Name" : "USEast1",
          "VPCId" : "vpc-22342342",
          "CidrBlock" : "10.223.0.0/21",
          {{#with data.root.us-east-1}}
          "AvailabilityZones" : [{{#each this.AvailabilityZones}}"{{this}}"{{#unless @last}},{{/unless}}{{/each}}],
          "AMIs" : { {{#each this.AMIs}}"{{this.id}}":"{{this.value}}"{{#unless @last}},{{/unless}}{{/each}} },
          {{/with}}
          "SubnetAddresses" : {
            "Public" : [
              { "Id" : "a" , "value" : "10.223.0.0/24" },
              { "Id" : "c" , "value" : "10.223.2.0/24" },
              { "Id" : "d" , "value" : "10.223.4.0/24" },
              { "Id" : "e" , "value" : "10.223.6.0/24" }
            ],
            "Private" : [
              { "Id" : "a", "value" : "10.223.1.0/24" },
              { "Id" : "c" ,"value" : "10.223.3.0/24" },
              { "Id" : "d", "value" : "10.223.5.0/24" },
              { "Id" : "e", "value" : "10.223.7.0/24" }
            ]
          },
          "SubnetIds" : {
            "Public"  : [ "subnet-123456", "subnet-234456", "subnet-566778", "subnet-777766" ],
            "Private" : [ "subnet-123457", "subnet-234457", "subnet-566779", "subnet-777767" ]
          }
        },
        {
          "Id" : "us-west-2",
          "Name" : "USWest2",
          "VPCId" : "vpc-24234232",
          "CidrBlock" : "10.223.8.0/21",
          {{#with data.root.us-west-2}}
          "AvailabilityZones" : [{{#each this.AvailabilityZones}}"{{this}}"{{#unless @last}},{{/unless}}{{/each}}],
          "AMIs" : { {{#each this.AMIs}}"{{this.id}}":"{{this.value}}"{{#unless @last}},{{/unless}}{{/each}} },
          {{/with}}
          "SubnetAddresses" : {
            "Public" : [
              { "Id" : "a" , "value" : "10.223.8.0/24" },
              { "Id" : "b" , "value" : "10.223.10.0/24" },
              { "Id" : "c" , "value" : "10.223.12.0/24" }
            ],
            "Private" : [
              { "Id" : "a", "value" : "10.223.9.0/24" },
              { "Id" : "b" ,"value" : "10.223.11.0/24" },
              { "Id" : "c", "value" : "10.223.13.0/24" }
            ]
          },
          "SubnetIds" : {
            "Public"  : [ "subnet-24234224", "subnet-5644322", "subnet-2342211" ],
            "Private" : [ "subnet-24234225", "subnet-5644323", "subnet-2342212" ]
          }
        }
      ],
