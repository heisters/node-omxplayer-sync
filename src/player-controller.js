var Queue = require('./queue')
  , merge = require('merge')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
;

var INTERFACE_SHORT_TO_FULL = {
  properties: 'org.freedesktop.DBus.Properties',
  player: 'org.mpris.MediaPlayer2.Player'
};

function PlayerController( bus, clock, omx, logger, config ) {
  EventEmitter.call( this );
  this.bus = bus;
  this.omx = omx;
  this.logger = logger;
  this.config = config;
  this.sync = { seconds: -1, time: -1 };
  this.speed = 0;
  this.clock = clock;
  this.resetMasterSync();
  this.on( "sync", this.seekToMaster.bind( this ) );
}

util.inherits( PlayerController, EventEmitter );

Object.defineProperties( PlayerController.prototype, {
  resetMasterSync: { value: function() {
    this.master = { values: new Queue(), sums: { time: 0, seconds: 0 }, avgs: { time: 0, seconds: 0 }, updated: false };
  } },

  invokeOMXDbus: { value: function( interfaceShort, options, cb ) {
    var interface = INTERFACE_SHORT_TO_FULL[ interfaceShort ] || interfaceShort;
    this.bus.invoke( merge( {
      path: '/org/mpris/MediaPlayer2',
      destination: 'org.mpris.MediaPlayer2.omxplayer',
      interface: interface
    }, options ), cb )
  } },


  getDuration: { value: function( cb ) {
    this.invokeOMXDbus( 'properties', { member: 'Duration' }, cb );
  } },

  getPosition: { value: function( cb ) {
    this.invokeOMXDbus( 'properties', { member: 'Position' }, cb );
  } },

  pause: { value: function( cb ) {
    this.invokeOMXDbus( 'player', { member: 'Pause' }, cb );
  } },

  play: { value: function( cb ) {
    this.invokeOMXDbus( 'player', { member: 'Play' }, cb );
  } },

  setPosition: { value: function( seconds ) {
    this.invokeOMXDbus( 'player', {
      member: 'SetPosition',
      signature: 'ox',
      body: [ '/not/used', seconds * 1e6 ]
    }, function( err, usPosition ) { // usPosition is just your arg, not the real new position
      if ( err ) this.logger.error( "Error setting position:", err );
    }.bind(this) );
  } },

  // wrapping with duration is a workaround for position sometimes returning
  // weird values
  pollStatus: { value: function() {
    this.getDuration( function( err, usDuration ) {
      if ( err ) {
        setTimeout( this.pollStatus.bind( this ), 500 );
        return;
      }

      setInterval( function() {
        var time = this.clock.now();

        this.getPosition( function( err, usPosition ) {
          if ( err || usPosition > usDuration || usPosition < 0 ) return;

          this.updateSync( usDuration / 1e6, usPosition / 1e6, time );

        }.bind( this ) );
      // don't try to hammer it at more than 2FPS or it's more error prone
      }.bind( this ), 1e3 / this.config.fps * 2 );
    }.bind( this ) );
  } },

  updateSync: { value: function( durationSecs, positionSecs, time ) {
    this.sync.duration = durationSecs;
    this.sync.seconds = positionSecs;
    this.sync.time = time;
    this.sync.positionUpdated = true;

    if ( this.localValid ) this.emit( "sync", this.sync );
  } },

  faster: { value: function() {
    if ( this.speed >= 1 ) return; // greater than once is not supported
    this.speed++;

    this.omx.faster();
  } },

  slower: { value: function() {
    if ( this.speed <= -3 ) return;
    this.speed--;

    this.omx.slower();
  } },

  localValid: {
    get: function() { return this.sync.positionUpdated; },
    set: function( v ) { return this.sync.positionUpdated = v; }
  },

  masterValid: {
    get: function() { return this.master.updated; },
    set: function( v ) { return this.master.updated = v; }
  },

  synchronize: { value: function( seconds, time ) {
    if ( ! this.clock.isSynchronized ) this.logger.sync( "clock to master time" );
    this.clock.sync( time ); // doesn't compensate for latency...

    if ( seconds < this.config.loopDetectionMarginSecs ) {
      this.resetMasterSync();
    }

    // Calculate averages

    this.master.updated = true;
    this.master.values.enqueue( { seconds: seconds, time: time } );
    this.master.sums.time += time;
    this.master.sums.seconds += seconds;

    while (
      this.master.values.getLength() &&
        this.master.values.peek().time < ( time - this.config.smoothingWindowMs )
    ) {
      var v = this.master.values.dequeue();
      this.master.sums.time -= v.time;
      this.master.sums.seconds -= v.seconds;
    }

    var l = this.master.values.getLength();
    this.master.avgs.time = this.master.sums.time / l;
    this.master.avgs.seconds = this.master.sums.seconds / l;
  } },

  masterSync: { get: function() {
    return { time: this.master.avgs.time, position: this.master.avgs.seconds };
  } },

  delta: { get: function() {
    return this._lastDelta;
  } },

  seekToMaster: { value: function() {
    if ( ! this.localValid || ! this.masterValid ) return;

    var now             = this.clock.now()
      , duration        = this.sync.duration
      , masterPosition  = this.master.avgs.seconds + ( now - this.master.avgs.time ) / 1e3
      , localPosition   = this.sync.seconds + ( now - this.sync.time ) / 1e3
      , delta           = localPosition - masterPosition
      , absDelta        = Math.abs( delta );

    this._lastDelta = delta;

    this.logger.debug( "sync", {
      now: now,
      duration: duration,
      masterPosition: masterPosition,
      localPosition: localPosition,
      delta: delta,
      absDelta: absDelta
    } );


    this.localValid = this.masterValid = false;


    if ( absDelta < this.config.toleranceSecs || absDelta > ( duration - this.config.loopDetectionMarginSecs ) ) {

      this.reset();


    } else if ( absDelta < this.config.fineTuneToleranceSecs ) {

      this.logger.sync( "fine-tune", delta.toFixed(2) );

      if      ( delta > 0 && this.speed >= 0 ) this.slower()
      else if ( delta < 0 && this.speed <= 0 ) this.faster();


    } else {

      this.logger.sync( "jump", delta.toFixed(2), masterPosition.toFixed(2) );

      this.reset();
      this.setPosition( masterPosition );

    }
  } },

  reset: { value: function() {
    while( this.speed < 0 ) this.faster();
    while( this.speed > 0 ) this.slower();
  } }

} );

module.exports = PlayerController;
