var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , uuid = require('node-uuid')
  , timers = require('timers')
  , NODE_STATE = { master: 0, slave: 1, indeterminate: 2 }
;

function ClusterNode( options, timer ) {
  EventEmitter.call( this );
  this.heartbeatTimeout = options.heartbeatTimeout || 2000;
  this.electTimeout = options.electTimeout || 100;
  this.votingTimeout = options.votingTimeout || 750;
  this.state = NODE_STATE.indeterminate;
  this.id = uuid.v4();
  this.timer = timer || timers;
}

util.inherits( ClusterNode, EventEmitter );

Object.defineProperties( ClusterNode.prototype, {
  elect: { value: function() {
    this.__electTimeout = this.timer.setTimeout( this.elect.bind( this ), this.electTimeout );
    this.emit( "elect", this.id );
  } },

  isElecting: {
    get: function() { return !! ( this.__electTimeout || this.__votingTimeout ); }
  },

  stopElection: { value: function() {
    this.timer.clearTimeout( this.__electTimeout );
    this.timer.clearTimeout( this.__votingTimeout );
    delete this.__electTimeout;
    delete this.__votingTimeout;
  } },

  heartbeat: { value: function() {
    if ( this.__heartbeatTimeout ) this.timer.clearTimeout( this.__heartbeatTimeout );

    this.__heartbeatTimeout = this.timer.setTimeout( function(){
      this.votes = 0;
      this.state = NODE_STATE.indeterminate;
      this.elect()
    }.bind( this ), this.heartbeatTimeout );

    this.emit( "heartbeat" );
  } },

  votes: {
    get: function() { return this._votes || 0; },
    set: function( v ) {
      this._votes = v;

      if ( this.isElecting ) {
        if ( this.__votingTimeout ) this.timer.clearTimeout( this.__votingTimeout );
        this.__votingTimeout = this.timer.setTimeout( function() {
          this.isMaster = true;
        }.bind( this ), this.votingTimeout );
      }
    }
  },

  isMaster: {
    get: function() { return this.state === NODE_STATE.master; },
    set: function( v ) {
      this.state = v ? NODE_STATE.master : NODE_STATE.indeterminate;
      this.stopElection();
      this.emit( "master" );
    }
  },

  isIndeterminate: {
    get: function() { return this.state === NODE_STATE.indeterminate; }
  },

  isSlave: {
    get: function() { return this.state === NODE_STATE.slave; },
    set: function( v ) {
      this.state = v ? NODE_STATE.slave : NODE_STATE.indeterminate;
      this.stopElection();
      this.emit( "slave" );
    }
  }
} );

module.exports = ClusterNode;
