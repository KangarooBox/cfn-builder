# cfn-builder

cfn-builder is a NodeJS command line application that will convert your JSON "blueprints" to an
AWS CloudFormation template.

## Introduction

The idea behind this project is to create a small number of JSON & Handlebars (.hbs) files (aka Blueprints) that
can be compiled into a larger number of CF templates.  Each project has multiple JSON files describing a particular
environment (i.e. Prod, QA, Dev) which is then compiled against a general blueprint which results in a CloudFormation
template that can be executed.

Visit the [Wiki pages](https://github.com/KangarooBox/cfn-builder/wiki) to get a more detailed rundown on how to use
cfn-builder.

## Dependencies

* Node.js
* npm

## Installing

Install cfn-builder from NPM using the following command line:

    npm -g install cfn-builder

## Testing

N/A (so far)
