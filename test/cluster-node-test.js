var assert = require('assert')
  , sinon = require('sinon')
  , ClusterNode = require('../src/cluster-node')
;

describe( "ClusterNode", function() {
  var node
    , timeouts
  ;

  beforeEach( function() {
    timeouts = [];
    node = new ClusterNode( { heartbeatTimeout: 1, votingTimeout: 1 } );
  } );

  it( "starts in an indeterminate state", function() {
    assert( ! node.isMaster );
    assert( ! node.isSlave );
    assert( node.isIndeterminate );
  } );

  it( "starts an election if it does not hear from a master within heartbeatTimeout milliseconds", function( done ) {
    node.once( "elect", function() {
      assert( node.isIndeterminate );
      done();
    } );
    node.heartbeat();
    node.elect();
  } );

  it( "declares victory if it receives votes and is not told to be a slave", function( done ) {
    var electSpy = sinon.spy();
    node.once( "elect", function() { electSpy(); node.votes++; } );
    node.once( "slave", function() {
      assert.fail( "should not be a slave" );
      done();
    } );
    node.once( "master", function() {
      assert( electSpy.called );
      assert( node.isMaster );
      setTimeout( done, 2 ); // wait to ensure slave isn't set
    } );
    node.heartbeat();
    node.elect();
  } );

  it( "declares victory if it does not get any responses to the election", function( done ) {
    var electSpy = sinon.spy();
    node.once( "elect", electSpy );
    node.once( "slave", function() {
      assert.fail( "should not be a slave" );
      done();
    } );
    node.once( "master", function() {
      assert( electSpy.called );
      assert( node.isMaster );
      setTimeout( done, 2 ); // wait to ensure slave isn't set
    } );
    node.heartbeat();
    node.elect();
  } );

  it( "becomes master if it receives votes before it starts an election", function( done ) {
    node.heartbeatTimeout = 1000;
    node.once( "elect", function() {
      //assert.fail( "should never get to an election" );
    } );
    node.once( "slave", function() {
      assert.fail( "should not be a slave" );
      done();
    } );
    node.once( "master", function() {
      assert( node.isMaster );
      setTimeout( done, 3 );
    } );
    node.heartbeat();
    node.elect();
    node.votes++;
  } );

  it( "becomes slave if told to before it starts an election", function( done ) {
    node.heartbeatTimeout = 1000;
    node.once( "elect", function() {
      //assert.fail( "should never get to an election" );
    } );
    node.once( "slave", function() {
      assert( node.isSlave );
      setTimeout( done, 3 );
    } );
    node.once( "master", function() {
      assert.fail( "should not be a master" );
      done();
    } );
    node.heartbeat();
    node.elect();
    node.isSlave = true;
  } );

  it( "immediately becomes a slave if set as a slave", function( done ) {
    var electSpy = sinon.spy();
    node.once( "elect", function() { electSpy(); node.votes++; node.isSlave = true; } );
    node.once( "slave", function() {
      assert( electSpy.called );
      assert( node.isSlave );
      setTimeout( done, 2 ); // wait to ensure master isn't set
    } );
    node.once( "master", function() {
      assert.fail( "should not be a master" );
      done();
    } );
    node.heartbeat();
    node.elect();
  } );

  it( "does not become master after it is set as a slave", function( done ) {
    var electSpy = sinon.spy();
    node.once( "elect", function() { electSpy(); node.votes++; node.isSlave = true; node.votes++; } );
    node.once( "slave", function() {
      assert( electSpy.called );
      assert( node.isSlave );
      setTimeout( done, 2 ); // wait to ensure master isn't set
    } );
    node.once( "master", function() {
      assert.fail( "should not be a master" );
      done();
    } );
    node.heartbeat();
    node.elect();
  } );

} );
