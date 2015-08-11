var omx = require('omxdirector')
  , osc = require('osc')
  , dbus = require('dbus-native')
  , fs = require('fs')
  , merge = require('merge')
  , EventEmitter = require('events').EventEmitter
  , FPS = 25
  , TOLERANCE = 1 / FPS
  , FINE_TUNE_TOLERANCE = 10 * TOLERANCE
  , PORT = 5000
  , filename = '/home/pi/test.mp4'
;

////////////////////////////////////////////////////////////////////////////////
// Synchronization

function Clock() {
  this.offset = 0;
  this.isSynchronized = false;
}

Object.defineProperties( Clock.prototype, {
  "now": { value: function() { return Date.now() + this.offset; } },
  "sync": { value: function( then ) {
    this.offset = Date.now() - then;
    this.isSynchronized = true;
  } }
} );

var clock = new Clock();

////////////////////////////////////////////////////////////////////////////////
// OSC Initialization
var oscRouter = new EventEmitter();
var oscPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: PORT,
  remoteAddress: '192.168.1.255',
  remotePort: PORT
});
oscPort.on( "bundle", handleBundle );
oscPort.on( "message", handleMessage );
oscPort.on( "ready", function() { console.log( "OSC sending and receiving on port " + PORT ); } );
oscPort.open();


function handleMessage ( message ) {
  oscRouter.emit( message.address, message.args );
};

function handleBundle ( bundle ) {
  var delta = clock.now() - bundle.timeTag.native;

  if ( delta <= 0 ) {
    bundle.packets.forEach( handlePacket );
  } else {
    setTimeout( function() { handleBundle( bundle ); }, delta );
  }
};

function handlePacket (packet) {
  packet.address ?  handleMessage( packet ) : handleBundle( packet );
};

////////////////////////////////////////////////////////////////////////////////
// DBus omxplayer control
var bus = dbus.sessionBus({
  busAddress: fs.readFileSync('/tmp/omxplayerdbus.'+process.env.USER, 'ascii').trim()
});

var INTERFACE_SHORT_TO_FULL = {
  properties: 'org.freedesktop.DBus.Properties',
  player: 'org.mpris.MediaPlayer2.Player'
};

function PlayerController( bus, clock ) {
  this.bus = bus;
  this.sync = { seconds: -1, time: -1, invalid: true };
  this.speed = 0;
  this.clock = clock;
}

Object.defineProperties( PlayerController.prototype, {
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
      if ( err ) console.log( "Error setting position:", err );
    } );
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
          if ( usPosition > usDuration ) return;
          this.sync.seconds = usPosition / 1e6;
          this.sync.time = time;
          this.sync.invalid = false;
        }.bind( this ) );
      // don't try to hammer it at more than 2FPS or it's more error prone
      }.bind( this ), 1e3 / FPS * 2 );
    }.bind( this ) );
  } },

  faster: { value: function() {
    this.speed++;
    omx.faster();
  } },

  slower: { value: function() {
    this.speed--;
    omx.slower();
  } },

  isReadyForSync: { value: function() {
    return ! this.sync.invalid && this.sync.seconds >= 0;
  } },

  invalid: {
    get: function() { return this.sync.invalid; },
    set: function( v ) { this.sync.invalid = v; }
  },

  seconds: {
    get: function() { return this.sync.seconds; }
  },

  time: {
    get: function() { return this.sync.time; }
  }

} );

var controller = new PlayerController( bus, clock );
controller.pollStatus();

////////////////////////////////////////////////////////////////////////////////
// Cluster

var waiting = false;
oscRouter.on( "/sync", function( args ) {
  var master = { seconds: args[0], time: args[1].native };
  if ( waiting || ! controller.isReadyForSync() || master.seconds < 0 ) return;

  if ( !clock.isSynchronized ) console.log( "synchronizing clock to master time" );
  clock.sync( master.time ); // doesn't compensate for latency...

  var now = clock.now();
  var masterPosition = master.seconds + ( now - master.time ) / 1e3;
  var localPosition = controller.seconds + ( now - controller.time ) / 1e3;
  var delta = localPosition - masterPosition;
  var absDelta = Math.abs( delta );

  if ( absDelta > TOLERANCE ) {
    controller.invalid = true;

    if ( absDelta < FINE_TUNE_TOLERANCE ) {
      console.log( "sync fine-tune", delta );

      if ( delta > 0 ) {
        controller.slower();
      } else {
        controller.faster();
      }

    } else {
      console.log( "sync jump", delta );

      if ( delta > 0 ) {
        waiting = true;
        controller.pause( function( err ) {
          if ( !err ) {
            var waitFor = delta * 1e3 - (clock.now() - now);
            setTimeout( function() {
              controller.play( function(){} );
              waiting = false;
            }, waitFor );
          } else waiting = true;
        } );

      } else {
        controller.setPosition( masterPosition );
      }
    }

  } else {
    // ensure speed is reset
    while( controller.speed < 0 ) { controller.faster(); }
    while( controller.speed > 0 ) { controller.slower(); }
  }

} );

////////////////////////////////////////////////////////////////////////////////
// OMXDirector setup
omx.enableNativeLoop();

process.on("SIGINT", function() {
  console.log("Quitting");
  omx.stop();
});

omx.on('stop', function(){
  console.log("Done.");
  process.exit();
});

//omx.on('status', function(status){ localSecs = status.seconds; } );


var args = [];
//args.push("--blank");
//args = args.concat(["--win", "0,0,960,540"]);
omx.play( filename, {loop: true, args: args} );

