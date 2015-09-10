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
  } );

  it( "immediately becomes a slave if set so", function( done ) {
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
  } );

  it( "ignores voting after it is set as a slave", function( done ) {
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
  } );

} );
