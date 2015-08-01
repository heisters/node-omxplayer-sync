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

var SYNC = { seconds: -1, time: -1, invalid: true };

function invokeOMXDbus( bus, interfaceShort, options, cb ) {
  var interface = INTERFACE_SHORT_TO_FULL[ interfaceShort ] || interfaceShort;
  bus.invoke( merge( {
    path: '/org/mpris/MediaPlayer2',
    destination: 'org.mpris.MediaPlayer2.omxplayer',
    interface: interface
  }, options ), cb )
}


function getDuration( bus, cb ) {
  invokeOMXDbus( bus, 'properties', { member: 'Duration' }, cb );
}

function getPosition( bus, cb ) {
  invokeOMXDbus( bus, 'properties', { member: 'Position' }, cb );
}

function pause( bus, cb ) {
  invokeOMXDbus( bus, 'player', { member: 'Pause' }, cb );
}

function play( bus, cb ) {
  invokeOMXDbus( bus, 'player', { member: 'Play' }, cb );
}

function setPosition( bus, seconds ) {
  invokeOMXDbus( bus, 'player', {
    member: 'SetPosition',
    signature: 'ox',
    body: [ '/not/used', seconds * 1e6 ]
  }, function( err, usPosition ) { // usPosition is just your arg, not the real new position
    if ( err ) console.log( "Error setting position:", err );
  } );
}

pollStatus( SYNC );

// wrapping with duration is a workaround for position sometimes returning
// weird values
function pollStatus( sync ) {
  getDuration( bus, function( err, usDuration ) {
    if ( err ) {
      setTimeout( function(){ pollStatus( sync ); }, 500 );
      return;
    }

    setInterval( function() {
      var time = clock.now();

      getPosition( bus, function( err, usPosition ) {
        if ( usPosition > usDuration ) return;
        sync.seconds = usPosition / 1e6;
        sync.time = time;
        sync.invalid = false;
      } );
    // don't try to hammer it at more than 2FPS or it's more error prone
    }, 1e3 / FPS * 2 );
  } );
}

////////////////////////////////////////////////////////////////////////////////
// Cluster

var waiting = false;
oscRouter.on( "/sync", function( args ) {
  var master = { seconds: args[0], time: args[1].native };
  if ( waiting || SYNC.invalid || SYNC.seconds < 0 || master.seconds < 0 ) return;

  if ( !clock.isSynchronized ) console.log( "synchronizing clock to master time" );
  clock.sync( master.time ); // doesn't compensate for latency...

  var now = clock.now();
  var masterPosition = master.seconds + ( now - master.time ) / 1e3;
  var localPosition = SYNC.seconds + ( now - SYNC.time ) / 1e3;
  var delta = localPosition - masterPosition;
  var absDelta = Math.abs( delta );

  if ( absDelta > TOLERANCE ) {
    SYNC.invalid = true;

    if ( absDelta < FINE_TUNE_TOLERANCE ) {
      console.log( "sync fine-tune", delta );

      if ( delta > 0 ) {
        omx.slower();
      } else {
        omx.faster()
      }

    } else {
      console.log( "sync jump", delta );

      if ( delta > 0 ) {
        waiting = true;
        pause( bus, function( err ) {
          if ( !err ) {
            var waitFor = delta * 1e3 - (clock.now() - now);
            setTimeout( function() {
              play( bus, function(){} );
              waiting = false;
            }, waitFor );
          } else waiting = true;
        } );

      } else {
        setPosition( bus, masterPosition );
      }
    }
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

