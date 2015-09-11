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
  this.nid = options.nid || uuid.v4();
  this.timer = timer || timers;
  this.elections = {};
}

ClusterNode.VOTE_RESULT = { SLAVE: -1, NONE: 0, MASTER: 1 };
ClusterNode.ELECTION_STATE = { UNKNOWN: undefined, UNRESOLVED: false, RESOLVED: true };

util.inherits( ClusterNode, EventEmitter );

Object.defineProperties( ClusterNode.prototype, {
  elect: { value: function( eid ) {
    this.__electTimeout = this.timer.setTimeout( function() {
      this.elect( eid );
    }.bind( this ), this.electTimeout );

    this.emit( "elect", this.nid, eid );
  } },

  electionIsUnknown: { value: function( eid ) {
    return this.elections[ eid ] === ClusterNode.ELECTION_STATE.UNKNOWN;
  } },

  electionIsUnresolved: { value: function( eid ) {
    return this.elections[ eid ] === ClusterNode.ELECTION_STATE.UNRESOLVED;
  } },

  electionIsResolved: { value: function( eid ) {
    return this.elections[ eid ] === ClusterNode.ELECTION_STATE.RESOLVED;
  } },

  resolveElection: { value: function( eid ) {
    this.elections[ eid ] = ClusterNode.ELECTION_STATE.RESOLVED;
  } },

  unresolveElection: { value: function( eid ) {
    this.elections[ eid ] = ClusterNode.ELECTION_STATE.UNRESOLVED;
  } },

  startElection: { value: function( eid ) {
    eid = eid || uuid.v4();

    this.state = NODE_STATE.indeterminate;
    this.unresolveElection( eid );
    this.elect( eid )
    this.waitToBecomeMaster( eid );
  } },

  stopElection: { value: function() {
    this.timer.clearTimeout( this.__electTimeout );
    this.timer.clearTimeout( this.__votingTimeout );
    delete this.__electTimeout;
    delete this.__votingTimeout;
  } },

  heartbeat: { value: function() {
    if ( this.__heartbeatTimeout ) this.timer.clearTimeout( this.__heartbeatTimeout );

    this.__heartbeatTimeout = this.timer.setTimeout( this.startElection.bind( this ), this.heartbeatTimeout );
  } },

  vote: { value: function( otherNid, eid ) {
    var result = ClusterNode.VOTE_RESULT.NONE;

    if ( this.electionIsUnknown( eid ) ) this.startElection( eid );

    if ( this.nid > otherNid ) {
      result = ClusterNode.VOTE_RESULT.MASTER;
      this.waitToBecomeMaster( eid );
    } else if ( this.nid < otherNid ) {
      result = ClusterNode.VOTE_RESULT.SLAVE;
      this.resolveElection( eid );
      this.isSlave = true;
    } // else my own id

    console.log( this.nid, otherNid, result );
    return result;
  } },

  waitToBecomeMaster: { value: function( eid ) {
    if ( this.electionIsResolved( eid ) ) console.log( 'election resolved' );
    if ( this.electionIsResolved( eid ) ) return;

    if ( this.__votingTimeout ) this.timer.clearTimeout( this.__votingTimeout );
    this.__votingTimeout = this.timer.setTimeout( function() {
      if ( this.electionIsResolved( eid ) ) console.log( 'election resolved' );
      if ( this.electionIsResolved( eid ) ) return;

      console.log( 'vt expired, setting master %s', this.nid );
      this.resolveElection( eid );
      this.isMaster = true;
    }.bind( this ), this.votingTimeout );
  } },

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
  },

  role: { get: function() {
    return this.isMaster ? "master" : ( this.isSlave ? "slave" : "indeterminate" );
  } }
} );

module.exports = ClusterNode;
