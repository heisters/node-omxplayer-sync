var omx = require('omxdirector')
  , fs = require('fs')
  , logger = require('./src/logger')
  , PlayerController = require('./src/player-controller')
  , OSCController = require('./src/osc-controller')
  , ClusterNode = require('./src/cluster-node')
  , Bus = require('./src/bus')
  , config = require('./config')
  , DEBUG = !!(config.debug || process.env.DEBUG)
;

if ( DEBUG ) { logger.level = 'debug'; }
else         { logger.level = 'info'; logger.transports.console.level = 'warn'; }

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
var osc = new OSCController( clock, {
  localAddress: '0.0.0.0',
  localPort: config.port,
  remoteAddress: config.broadcastAddress,
  remotePort: config.port,
  broadcast: true
} );
osc.on( "ready", function() { logger.info( "OSC sending and receiving on port " + options.localPort ); } );
osc.open();

////////////////////////////////////////////////////////////////////////////////
// DBus omxplayer control

var bus = new Bus();
bus.on( "non-fatal-error", function() { logger.warn( "Could not connect to dbus, trying again." ); } );
bus.on( "error", function() { logger.fatal( "Failed to connect to dbus." ); } );

var controller = new PlayerController( bus, clock, omx, logger, config );

bus.on( "ready", function( dbus ) {
  controller.pollStatus();
} );

////////////////////////////////////////////////////////////////////////////////
// Node

var node = new ClusterNode( { heartbeatTimeout: 1000 } );
node.heartbeat();

////////////////////////////////////////////////////////////////////////////////
// Node Transport

node.on( "master", function() {
  controller.reset();
  controller.play();
  logger.info( "imma master!" );
} );
node.on( "slave", function() { logger.info( "imma slave!" ); } );

node.on( "elect", function( id ) {
  logger.info( "send elect " + id );
  osc.send( {
    address: "/elect",
    args: [ { type: 's', value: id } ]
  } );
} );

controller.on( "status", function( status ) {
  if ( ! node.isMaster ) return;

  var elapsed = status.seconds
    , time = osc.timeTag( 0, status.time );

  osc.send( {
    address: "/sync",
    args: [ { type: 'f', value: elapsed }, { type: 't', value: time } ]
  } );
} );

bus.on( "ready", function() {
  osc.on( "/sync", function( args ) {
    node.heartbeat();
    if ( node.isIndeterminate ) node.isSlave = true;
    if ( node.isSlave ) controller.synchronize( args[ 0 ], args[ 1 ].native );
  } );

  osc.on( "/elect", function( args ) {
    var otherId = args[ 0 ];
    if ( node.id > otherId ) {
      logger.info( "got elect " + otherId + ", incrementing votes" );
      node.votes++;
    } else if ( node.id < otherId ) {
      logger.info( "got elect " + otherId + ", becoming slave" );
      node.isSlave = true;
    } // else my own id
  } );
} );

////////////////////////////////////////////////////////////////////////////////
// OMXDirector setup
omx.enableNativeLoop();

process.on("SIGINT", function() {
  logger.info("Quitting");
  omx.stop();
});

omx.on('stop', function(){
  logger.info("Done.");
  process.exit();
});

//omx.on('status', function(status){ localSecs = status.seconds; } );


var args = [];
args.push("--blank");
if ( ! DEBUG ) args.push("--no-osd");
//args = args.concat(["--win", "0,0,960,540"]);
omx.play( config.filename, {loop: true, args: args} );

bus.create();
