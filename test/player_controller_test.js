var assert = require("assert")
  , sinon = require("sinon")
  , PlayerController = require('../src/player_controller')
;

describe( "PlayerController", function() {
  var controller
    , fakeBus
    , fakeClock
    , fakeLogger
    , config = { smoothingWindowMs: 10 }
  ;

  beforeEach( function() {
    fakeBus = sinon.spy()
    fakeClock = { sync: sinon.spy(), now: sinon.spy() };
    fakeLogger = { sync: sinon.spy(), debug: sinon.spy(), info: sinon.spy(), error: sinon.spy() };

    controller = new PlayerController( fakeBus, fakeClock, fakeLogger, config );
  } );

  describe( ".synchronize", function() {
    it( "syncs the clock on the first call", function() {
      assert( ! fakeClock.sync.called );

      controller.synchronize( 0, 1 );

      assert( fakeClock.sync.withArgs( 1 ).calledOnce );
    } );

    it( "marks master as having been updated", function() {
      assert.equal( controller.master.updated, false );

      controller.synchronize( 0, 1 );

      assert.equal( controller.master.updated, true );
    } );

    it( "computes a moving average of time", function() {
      assert.equal( controller.master.avgs.time, 0 );
      assert.equal( controller.config.smoothingWindowMs, 10 );

      for ( var time = 1; time <= 10; ++time ) {
        controller.synchronize( 0, time );
      }

      assert.equal( controller.master.avgs.time, ( 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 ) / 10 );

      controller.synchronize( 0, 11 );

      assert.equal( controller.master.avgs.time, ( 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 ) / 11 );

      controller.synchronize( 0, 12 );

      assert.equal( controller.master.avgs.time, ( 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 ) / 11 );
    } );

    it( "computes a moving average of position", function() {
      assert.equal( controller.master.avgs.seconds, 0 );
      assert.equal( controller.config.smoothingWindowMs, 10 );

      for ( var x = 1; x <= 10; ++x ) {
        controller.synchronize( x + 10, x );
      }

      assert.equal( controller.master.avgs.seconds, ( 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 ) / 10 );

      controller.synchronize( 21, 11 );

      assert.equal( controller.master.avgs.seconds, ( 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 ) / 11 );

      controller.synchronize( 22, 12 );

      assert.equal( controller.master.avgs.seconds, ( 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 ) / 11 );
    } );
  } );
} );
