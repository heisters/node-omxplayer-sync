var assert = require("assert")
  , sinon = require("sinon")
  , PlayerController = require('../src/player-controller')
  , logger = require('../src/logger')
;
if ( process.env.DEBUG ) logger.level = 'debug';
PlayerController.prototype.setMaxListeners(0);

describe( "PlayerController", function() {
  var controller
    , fakeBus
    , fakeClock
    , fakeLogger
    , fakeOmx
    , config = { smoothingWindowMs: 10 }
  ;

  beforeEach( function() {
    fakeOmx = { faster: sinon.spy(), slower: sinon.spy() };
    fakeBus = { invoke: sinon.spy() };
    fakeClock = { sync: sinon.spy(), now: sinon.spy() };
    if ( process.env.DEBUG ) {
      fakeLogger = logger;
    } else {
      fakeLogger = { sync: sinon.spy(), debug: sinon.spy(), info: sinon.spy(), error: sinon.spy() };
    }

    controller = new PlayerController( fakeBus, fakeClock, fakeOmx, fakeLogger, config );
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

  describe( ".seekToMaster", function() {
    var now
    ;

    var playMethods = [ "reset", "slower", "faster", "pauseFor", "setPosition" ];
    var assertExactlyPlayMethodsCalled = function() {
      var called = Array.prototype.slice.call( arguments );
      var notCalled = playMethods.filter( function( p ) { return called.indexOf( p ) === -1; } );
      notCalled.forEach( function( p ) { assert( ! controller[ p ].called, "expected " + p + " to not be called" ); } );
      called.forEach( function( p ) { assert( controller[ p ].called, "expected " + p + " to be called" ); } );
    };

    beforeEach( function() {
      controller.config.smoothingWindowMs = 0; // disable smoothing
      controller.config.toleranceSecs = 0.01;
      controller.config.loopDetectionMarginSecs = 1;
      controller.config.fineTuneToleranceSecs = 0.1;
      controller.config.jumpToleranceSecs = 2;

      now = 0;
      controller.clock.now = function() { return now; };
      playMethods.forEach( function( p ) { sinon.spy( controller, p ); } );
    } );

    it( "resets and does nothing if it is off less than the tolerance", function() {
      controller.updateSync( 10 /* duration */, 1 /* position */, now );
      controller.synchronize( 1.009 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "reset" );
    } );

    it( "resets and does nothing when it loops", function() {
      controller.updateSync( 10 /* duration */, 10 /* position */, now );
      controller.synchronize( 0.1 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "reset" );
    } );

    it( "speeds up when it is just slightly behind", function() {
      controller.updateSync( 10 /* duration */, 1 /* position */, now );
      controller.synchronize( 1.05 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "faster" );
    } );

    it( "slows down when it is just slightly ahead", function() {
      controller.updateSync( 10 /* duration */, 1 /* position */, now );
      controller.synchronize( 0.95 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "slower" );
    } );

    it( "waits if it is ahead by less than the jump tolerance", function() {
      controller.updateSync( 10 /* duration */, 3 /* position */, now );
      controller.synchronize( 1.1 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "pauseFor" );
    } );

    it( "jumps if it is ahead by more than the jump tolerance", function() {
      controller.updateSync( 10 /* duration */, 3 /* position */, now );
      controller.synchronize( 1 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "setPosition" );
      assert( controller.setPosition.withArgs( 1 ).called );
    } );

    it( "jumps if it is behind by more than the jump tolerance", function() {
      controller.updateSync( 10 /* duration */, 3 /* position */, now );
      controller.synchronize( 5 /* position */, now );

      controller.seekToMaster();

      assertExactlyPlayMethodsCalled( "setPosition" );
      assert( controller.setPosition.withArgs( 5 ).called );
    } );
  } );
} );
