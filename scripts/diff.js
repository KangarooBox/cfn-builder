#!/usr/bin/env node

'use strict';

// Local
const utilities = require('../lib/utilities');
const diff      = require('../lib/diff');
const fs        = require('fs');
const path      = require('path');

var args  = utilities.parseArguments(true);
var cwd   = process.cwd();

diff(cwd, args.envName, args.projectName)
// .then(function(msg, delta){
//   console.log(msg);
// })

// blah.then(function(msg, delta){
//       console.log(msg);
//     })
//     .catch(function(err){
//       console.error(err);
//     });

// (async (dirPath) => {
//   const dir = await fs.promises.opendir(dirPath);
//   for await (const file of dir) {

//     var filePath = path.join(dirPath, file.name);

//     fs.stat(filePath, function(err, stat){
//       if (!stat.isDirectory()) {
//         var nameArr = file.name.split('.');

//         diff(cwd, nameArr[1], nameArr[0], function(err, msg, delta){
//           if(err){
//             // console.error(err);
//           } else {
//             if(delta){
//               console.log(`${nameArr[0]}.${nameArr[1]} is different!`);
//             }
//             // console.log(delta);
//             // console.log(msg);
//           }
//         })
//       }
//     });
//   }
// })('./blueprints/stacks');
