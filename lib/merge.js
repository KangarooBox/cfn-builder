"use strict";

module.exports = function merge(dest, src) {
  Object.keys(src).forEach(function(key) {
    dest[key] = src[key];
  });
  return dest;
};