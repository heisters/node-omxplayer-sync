var assert = require('assert')
  , sinon = require('sinon')
  , ClusterNode = require('../src/cluster-node')
;

describe( "ClusterNode", function() {

  describe( "in isolation", function() {
    var node
      , electSpy
    ;

    beforeEach( function() {
      node = new ClusterNode( { nid: "b", heartbeatTimeout: 1, votingTimeout: 1 } );
      electSpy = sinon.spy();
    } );

    afterEach( function() {
      node.removeAllListeners();
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
  } );

  describe( "with a simulated cluster", function() {
    var nodeA
      , nodeB
      , nodeC
      , allNodes
    ;

    beforeEach( function() {
      nodeA = new ClusterNode( { nid: "a", heartbeatTimeout: 1, votingTimeout: 1 } );
      nodeB = new ClusterNode( { nid: "b", heartbeatTimeout: 1, votingTimeout: 1 } );
      nodeC = new ClusterNode( { nid: "c", heartbeatTimeout: 1, votingTimeout: 1 } );
      allNodes = shuffleArray( [ nodeA, nodeB, nodeC ] );

      allNodes.forEach( function( n ) {
        n.on( "elect", function( nid, eid ) {
          allNodes.forEach( function( n2 ) { n2.vote( nid, eid ); } );
        } );
      } );
    } );

    afterEach( function() {
      allNodes.forEach( function( n ) { n.removeAllListeners(); } );
    } );

    it( "elects nodeC as master when all nodes come up at the same time", function( done ) {
      allNodes.forEach( function( n ) { n.heartbeat(); } );

      setTimeout( function() {
        assert.equal( nodeA.role, 'slave' );
        assert.equal( nodeB.role, 'slave' );
        assert.equal( nodeC.role, 'master' );

        assert( ! nodeA.isElecting );
        assert( ! nodeB.isElecting );
        assert( ! nodeC.isElecting );

        done();
      }, 10 );
    } );

    it ( "elects nodeC as master when one node comes up first", function( done ) {
      nodeA.heartbeat();

      setTimeout( function() {
        assert.equal( nodeA.role, 'slave' );
        assert.equal( nodeB.role, 'slave' );
        assert.equal( nodeC.role, 'master' );

        done();
      }, 10 );
    } );

    it( "keeps nodeB as master when one comes up later", function( done ) {
      allNodes.splice( allNodes.indexOf( nodeC ), 1 );
      nodeA.heartbeat();
      nodeB.heartbeat();

      setTimeout( function() {
        assert.equal( nodeA.role, 'slave' );
        assert.equal( nodeB.role, 'master' );
        assert.equal( nodeC.role, 'indeterminate' );

        nodeC.heartbeat();
        nodeC.isSlave = true;

        assert.equal( nodeA.role, 'slave' );
        assert.equal( nodeB.role, 'master' );
        assert.equal( nodeC.role, 'slave' );

        done();
      }, 10 );
    } );
  } );

} );

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

