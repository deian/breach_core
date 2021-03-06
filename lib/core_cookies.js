/*
 * Breach: core_cookies.js
 *
 * Copyright (c) 2014, Stanislas Polu. All rights reserved.
 *
 * @author: spolu
 *
 * @log:
 * - 2014-05-21 spolu   Creation
 */
"use strict"

var common = require('./common.js');
var async = require('async');
var api = require('exo_browser');

// ## core_cookies
//
// Breach `core` module cookies handling implementation.
//
// The `core_cookies` object is in charge of emitting cookie-related events as
// well as storing cookies in gigfs. We're not exposing the storage APIs for
// now as we only have access to the PersistentCookieStore API within the 
// exo_browser which means we can't wait for the modules to be loaded to start 
// servicing cookies.
//
// In the future we may want to allow modules to register themselves causing
// the cookie monster to be entirely flushed and reloaded?
//
// TODO(spolu): Expose broader APIs for modules to entirely handle cookie
//              storage and retrieval.
//
// ```
// @spec { core_module, session }
// @inherits {}
// ```
var core_cookies = function(spec, my) {
  var _super = {};
  my = my || {};
  spec = spec || {};

  my.core_module = spec.core_module;
  my.session = spec.session;

  //
  // #### _public_
  //
  var init;                      /* init(cb_); */
  var kill;                      /* kill(cb_); */

  var load_for_key;              /* load_for_key(key, cb_(cookies)); */
  var flush;                     /* flush(cb_()); */
  var add;                       /* add(cookie); */
  var remove;                    /* remove(cookie); */
  var update_access_time;        /* update_access_time(cookie); */
  var force_keep_session_state;  /* force_keep_session_state(); */

  //
  // #### _private_
  //
  var domain_keys_reducer;       /* keys_reducer(oplog); */
  var cookies_reducer;           /* cookies_reducer(oplog); */

  //
  // #### _that_
  //
  var that = {};

  /****************************************************************************/
  /* PRIVATE HELPERS */
  /****************************************************************************/
  // ### domain_keys_reducer
  //
  // Reducer used with core_data to store list of known domain keys (eTLD+1)
  // ```
  // @oplog {array} the array of ops to reduce
  // ```
  domain_keys_reducer = function(oplog) {
    /* Returns a state object inluding currently opened tabs, recover list */
    var value = {};
    oplog.forEach(function(op) {
      if(typeof op.value !== 'undefined') {
        value = op.value || {}
      }
      else if(op.payload) {
        switch(op.payload.type) {
          case 'set': {
            if(op.payload.count > 0) {
              value[op.payload.domain_key] = op.payload.count;
            }
            else {
              delete value[op.payload.domain_key];
            }
            break;
          }
          default: {
            break;
          }
        }
      }
    });
    return value;
  };

  // ### cookies_reducer
  //
  // Reducer used with core_data to store the cookies for a domain key
  // ```
  // @oplog {array} the array of ops to reduce
  // ```
  cookies_reducer = function(oplog) {
    /* Returns a state object inluding currently opened tabs, recover list */
    var value = [];
    oplog.forEach(function(op) {
      if(typeof op.value !== 'undefined') {
        value = op.value || [];
      }
      else if(op.payload) {
        switch(op.payload.type) {
          case 'add': {
            for(var i = value.length - 1; i >= 0; i--) {
              if(value[i].creation === op.payload.cookie.creation) {
                value.splice(i, 1);
              }
            }
            value.push(op.payload.cookie);
            break;
          }
          case 'remove': {
            for(var i = value.length - 1; i >= 0; i--) {
              if(value[i].creation === op.payload.cookie.creation) {
                value.splice(i, 1);
              }
            }
            break;
          }
          case 'update_access_time': {
            for(var i = value.length - 1; i >= 0; i--) {
              if(value[i].creation === op.payload.cookie.creation) {
                value[i].last_access = op.payload.cookie.last_access;
              }
            }
            break;
          }
          default: {
            break;
          }
        }
      }
    });
    return value;
  };


  /****************************************************************************/
  /* PUBLIC METHODS */
  /****************************************************************************/
  // ### load_for_key
  //
  // Cookie handler registered with the core_module exo_session. The load will
  // be redirected to the module procedure registered if it exists.
  // ```
  // @key {string} the key to load or null if all cookies
  // @cb_ {function(cookies)}
  // ```
  load_for_key = function(key, cb_) {
    common.log.out('[core_cookies] load_for_key: ' + key);
    if(key && key.length > 0) {
      var c_path = require('path').join(my.session.session_id(), 'core_cookies', 
                                        'cookies', key);
      my.session.gig().get('core', 'core_cookies:cookies', c_path, 
                           function(err, value) {
        if(err) {
          common.log.error(err);
          return cb_([]);
        }
        else {
          common.log.out('[core_cookies] loaded ' + value.length + ' cookies');
          return cb_(value);
        }
      });
    }
    else if(key === null) {
      var all = [];
      async.waterfall([
        function(cb_) {
          var k_path = require('path').join(my.session.session_id(), 
                                            'core_cookies', 'keys');
          my.session.gig().get('core', 'core_cookies:domain_keys', k_path, cb_);
        },
        function(keys, cb_) {
          async.eachLimit(Object.keys(keys), 10, function(k, cb_) {
            var c_path = require('path').join(my.session.session_id(), 
                                              'core_cookies', 'cookies', k);
            my.session.gig().get('core', 'core_cookies:cookies', c_path, 
                                 function(err, value) {
              if(err) {
                common.log.error(err);
              }
              else {
                all = all.concat(value);
              }
              /* We ignore errors here. */
              return cb_();
            });
          }, cb_);
        }
      ], function(err) {
        if(err) {
          common.log.error(err);
          return cb_([]);
        }
        else {
          common.log.out('[core_cookies] loaded ' + all.length + ' cookies');
          return cb_(all);
        }
      });
    }
    else {
      return cb_([]);
    }
  };

  // ### flush
  //
  // Cookie handler registered with the core_module exo_session. The flush will
  // be redirected to the module procedure registered if it exists.
  // ```
  // @cb_ {function()}
  // ```
  flush = function(cb_) {
    common.log.out('[core_cookies] flush');
    return cb_();
    /* NOP. */
  };

  // ### add
  //
  // Cookie handler registered with the core_module exo_session
  // ```
  // @cookie {object} the cookie to add
  // ```
  add = function(cookie) {
    common.log.debug('[core_cookies] add');
    common.log.debug(JSON.stringify(cookie, null, 2));
    my.session.module_manager().core_emit('cookies:add', cookie);
    
    var c_path = require('path').join(my.session.session_id(), 'core_cookies', 
                                      'cookies', cookie.domain_key);
    var k_path = require('path').join(my.session.session_id(), 'core_cookies', 
                                      'keys');

    async.waterfall([
      function(cb_) {
        my.session.gig().push('core', 'core_cookies:cookies', c_path, {
          type: 'add',
          cookie: cookie
        }, cb_);
      },
      function(value, cb_) {
        my.session.gig().push('core', 'core_cookies:domain_keys', k_path, {
          type: 'set',
          domain_key: cookie.domain_key,
          count: value.length
        }, cb_);
      }
    ], function(err) {
      if(err) {
        common.log.error(err);
      }
    });
  };

  // ### remove
  //
  // Cookie handler registered with the core_module exo_session
  // ```
  // @cookie {object} the cookie to remove
  // ```
  remove = function(cookie) {
    common.log.debug('[core_cookies] remove');
    common.log.debug(JSON.stringify(cookie, null, 2));
    my.session.module_manager().core_emit('cookies:remove', cookie);

    var c_path = require('path').join(my.session.session_id(), 'core_cookies', 
                                      'cookies', cookie.domain_key);
    var k_path = require('path').join(my.session.session_id(), 'core_cookies', 
                                      'keys');

    async.waterfall([
      function(cb_) {
        my.session.gig().push('core', 'core_cookies:cookies', c_path, {
          type: 'remove',
          cookie: cookie
        }, cb_);
      },
      function(value, cb_) {
        my.session.gig().push('core', 'core_cookies:domain_keys', k_path, {
          type: 'set',
          domain_key: cookie.domain_key,
          count: value.length
        }, cb_);
      }
    ], function(err) {
      if(err) {
        common.log.error(err);
      }
    });
  };

  // ### update_access_time
  //
  // Cookie handler registered with the core_module exo_session
  // ```
  // @cookie {object} the cookie to update
  // ```
  update_access_time = function(cookie) {
    common.log.debug('[core_cookies] update_access_time');
    common.log.debug(JSON.stringify(cookie, null, 2));
    my.session.module_manager().core_emit('cookies:update_access_time', cookie);

    var c_path = require('path').join(my.session.session_id(), 'core_cookies', 
                                      'cookies', cookie.domain_key);

    my.session.gig().push('core', 'core_cookies:cookies', c_path, {
      type: 'update_access_time',
      cookie: cookie
    }, function(err, value) {
      if(err) {
        common.log.error(err);
      }
    });
  };

  // ### force_keep_session_state
  //
  // Cookie handler registered with the core_module exo_session
  force_keep_session_state = function() {
    my.session.module_manager().core_emit('cookies:force_keep_session_state', 
                                          null);
    /* NOP. */
  };

  /****************************************************************************/
  /* EXPOSED PROCEDURES */
  /****************************************************************************/

  /****************************************************************************/
  /* INITIALIZATION */
  /****************************************************************************/
  // ### init
  // 
  // Initialializes the core cookies module
  // ```
  // @cb_ {function(err)} asynchronous callback
  // ```
  init = function(cb_) {
    my.session.gig().register('core_cookies:domain_keys', domain_keys_reducer);
    my.session.gig().register('core_cookies:cookies', cookies_reducer);
    return cb_();
  };

  // ### kill
  //
  // Kills the core cookies module
  // ```
  // @cb_ {function(err)} asynchronous callback
  // ```
  kill = function(cb_) {
    return cb_();
  };

  common.method(that, 'init', init, _super);
  common.method(that, 'kill', kill, _super);

  common.method(that, 'load_for_key', load_for_key, _super);
  common.method(that, 'flush', flush, _super);
  common.method(that, 'add', add, _super);
  common.method(that, 'remove', remove, _super);
  common.method(that, 'update_access_time', update_access_time, _super);
  common.method(that, 'force_keep_session_state', 
                      force_keep_session_state, _super);


  return that;
};

exports.core_cookies = core_cookies;
