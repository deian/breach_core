/*
 * Breach: [dist] linux.js
 *
 * Copyright (c) 2014, Stanislas Polu. All rights reserved.
 *
 * @author: spolu
 *
 * @log:
 * - 2014-05-15 spolu   Creation
 */
"use strict"

var common = require('../lib/common.js');
var async = require('async');
var mkdirp = require('mkdirp');
var fs = require('fs-extra');
var npm = require('npm');
var path = require('path');

var module_path = path.join(__dirname, '..');
var package_json = require(path.join(module_path, 'package.json'));

var base_name;
var out_path;
var tmp_dist_path;
var out_dist_path;

async.series([
  function(cb_) {
    if(!process.argv[2] && !process.argv[3]) {
      return cb_(common.err('Usage: linux.js arch path/to/exo_browser.tar.gz',
                            'dist_linux:missing_exo_browser_dist'));
    }
    common.log.out('Making `linux` distribution for v' + package_json.version);
    common.log.out('Using breach_core: ' + module_path);
    common.log.out('Using arch: ' + process.argv[2]);
    common.log.out('Using ExoBrowser: ' + process.argv[3]);

    base_name = 'breach-v' + package_json.version + '-' + 
      'linux' + '-' + process.argv[2];
    out_path = path.join(process.cwd(), 'out');
    tmp_dist_path = path.join('/tmp', 'breach.linux.dist');
    out_dist_path = path.join(out_path, base_name);

    return cb_();
  },
  function(cb_) {
    fs.remove(out_path, cb_);
  },
  function(cb_) {
    fs.remove(tmp_dist_path, cb_);
  },

  /* Create tmp dist path and copy local module there. */
  function(cb_) {
    mkdirp(path.join(tmp_dist_path, '__AUTO_UPDATE_BUNDLE__'), cb_);
  },
  function(cb_) {
    fs.copy(module_path, 
            path.join(tmp_dist_path, '__AUTO_UPDATE_BUNDLE__', 'breach_core'), cb_);
  },
  function(cb_) {
    mkdirp(path.join(tmp_dist_path, '__AUTO_UPDATE_BUNDLE__', 'exo_browser'), cb_);
  },

  /* Extract exo_browser in dist path */
  function(cb_) {
    var tar = require('child_process').spawn('tar', 
      ['xfz', process.argv[3], 
       '-C', path.join(tmp_dist_path, '__AUTO_UPDATE_BUNDLE__', 'exo_browser'),
       '--strip', '1']);
    tar.stdout.on('data', function (data) {
      console.log('stdout: ' + data);
    });
    tar.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });
    tar.on('close', function (code) {
      if(code !== 0) {
        return cb_(common.err('Extraction failed with code: ' + code,
                              'auto_updater:failed_extraction'));

      }
      return cb_();
    });
  },

  /* Copy linux wrapper. */
  function(cb_) {
    fs.copy(path.join(__dirname, './linux_wrapper.sh'), 
            path.join(tmp_dist_path, 'breach'), cb_);
  },
  function(cb_) {
    fs.chmod(path.join(tmp_dist_path, 'breach'), '755', cb_);
  },

  /* Final copy. */
  function(cb_) {
    mkdirp(out_path, cb_);
  },
  function(cb_) {
    fs.rename(tmp_dist_path, out_dist_path, cb_);
  },

  /* Final tar */
  function(cb_) {
    var tar = require('child_process').spawn('tar', 
      ['cfz', base_name + '.tar.gz', base_name], {
      cwd: out_path
    });
    tar.stdout.on('data', function (data) {
      console.log('stdout: ' + data);
    });
    tar.stderr.on('data', function (data) {
      console.log('stderr: ' + data);
    });
    tar.on('close', function (code) {
      if(code !== 0) {
        return cb_(common.err('Extraction failed with code: ' + code,
                              'auto_updater:failed_extraction'));

      }
      return cb_();
    });
  }

], function(err) {
  if(err) {
    common.fatal(err);
  }
  process.exit(0);
});

