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

cfn-builder expects certain files to be in a certain directory structure.  Under the root directory there should be a
'blueprints' directory.  This directory contains all of the cnf-builder specific files.  Inside the 'blueprints'
directory there should be two other directories: 'common' & 'stacks'.  The 'common' directory contains blueprints that
are used in multiple stacks, such as 'globals.hbs' and 'live.hbs'.  The 'stacks' directory contains blueprints that
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


