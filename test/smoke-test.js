var assert = require("assert")
  , OSCController = require('../src/osc-controller')
  , ClusterNode = require('../src/cluster-node')
  , Bus = require('../src/bus')
;

describe( "smoke tests", function() {
  it( "does not blow up on init", function() {
    new Bus();
    new OSCController();
    new ClusterNode( { heartbeatTimeout: 1000 } );
  } );
} );
