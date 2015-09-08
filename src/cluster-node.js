var EventEmitter = require('events').EventEmitter
  , uuid = require('node-uuid')
  , NODE_STATE = { master: 0, slave: 1, indeterminate: 2 }
;

function ClusterNode( options ) {
  this.heartbeatTimeout = options.heartbeatTimeout || 1000;
  this.electTimeout = options.electTimeout || 100;
  this.votingTimeout = options.votingTimeout || 750;
  this.state = NODE_STATE.indeterminate;
  this.id = uuid.v4();
  this.on( "heartbeat lost", this.elect.bind( this ) );
}

ClusterNode.prototype = new EventEmitter();

Object.defineProperties( ClusterNode.prototype, {
  elect: { value: function( cycle ) {
    cycle = cycle === undefined ? 0 : cycle;
    if ( cycle === 0 ) this.votes = 0;
    this.state = NODE_STATE.indeterminate;

    this.emit( "elect", this.id );
    this.__electTimeout = setTimeout( function() {
      this.elect( cycle + 1 );
    }.bind( this ), this.electTimeout );
  } },

  stopElection: { value: function() {
    clearTimeout( this.__electTimeout );
    clearTimeout( this.__votingTimeout );
  } },

  heartbeat: { value: function() {
    if ( this.__heartbeatTimeout ) clearTimeout( this.__heartbeatTimeout );

    this.__heartbeatTimeout = setTimeout( function(){
      this.emit( "heartbeat lost" )
    }.bind( this ), this.heartbeatTimeout );

    this.emit( "heartbeat" );
  } },

  votes: {
    get: function() { return this._votes; },
    set: function( v ) {
      this._votes = v;
      if ( this.__votingTimeout ) clearTimeout( this.__votingTimeout );
      this.__votingTimeout = setTimeout( function() {
        this.isMaster = true;
      }.bind( this ), this.votingTimeout );
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
