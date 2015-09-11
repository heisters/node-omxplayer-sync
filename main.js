var omx = require('omxdirector')
  , logger = require('./src/logger')
  , PlayerController = require('./src/player-controller')
  , OSCController = require('./src/osc-controller')
  , ClusterNode = require('./src/cluster-node')
  , Bus = require('./src/bus')
  , config = require('./config')
  , Web = require('./src/web')
  , dns = require('./src/dns')
  , Clock = require('./src/clock')
  , DEBUG = !!(config.debug || process.env.DEBUG)
;

if ( DEBUG ) { logger.level = 'debug'; }
else         { logger.level = 'info'; logger.transports.console.level = 'warn'; }

////////////////////////////////////////////////////////////////////////////////
// Synchronization

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
osc.on( "ready", function() { logger.info( "OSC sending and receiving on port " + config.port ); } );
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

var node = new ClusterNode( { heartbeatTimeout: 2000 } );
node.heartbeat();

////////////////////////////////////////////////////////////////////////////////
// Web Interface

var web = new Web( { port: 8080 /*, serviceName: 'cluster' */ } );
web.listen();

////////////////////////////////////////////////////////////////////////////////
// Node Transport

node.on( "master", function() {
  controller.reset();
  controller.play();
  logger.info( "imma master!" );
} );
node.on( "slave", function() { logger.info( "imma slave!" ); } );

node.on( "elect", function( nid, eid ) {
  logger.info( "send elect " + nid );
  osc.send( {
    address: "/elect",
    args: [ { type: 's', value: nid }, { type: 's', value: eid } ]
  } );
} );

bus.on( "ready", function() {
  osc.on( "/elect", function( args ) {
    var otherNid = args[ 0 ];
    var eid = args[ 1 ];
    var result = node.vote( otherNid, eid );

    if ( result === ClusterNode.VOTE_RESULT.MASTER ) {
      logger.info( "got elect " + otherNid + ", incrementing votes" );
    } else if ( result === ClusterNode.VOTE_RESULT.SLAVE ) {
      logger.info( "got elect " + otherNid + ", becoming slave" );
    }
  } );
} );

controller.on( "sync", function( status ) {
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
    if ( node.isIndeterminate ) {
      logger.info( "got sync from master, becoming a slave without election" );
      node.isSlave = true;
    }
    if ( node.isSlave ) controller.synchronize( args[ 0 ], args[ 1 ].native );
  } );
} );

osc.on( "/status", function( args ) {
  var nid = args[ 0 ];
  try {
    var status = JSON.parse( args[ 1 ] );
  } catch ( e ) {
    logger.error( "invalid status message %s", args[ 1 ] );
  }

  web.updateStatus( nid, status );
} );

dns.lookupIP( function( ipv4, ipv6, hostname ) {
  setInterval( function() {
    var status = {
        nid: node.nid
      , hostname: hostname
      , ipv4: ipv4
      , ipv6: ipv6
      , role: node.role
      , sync: controller.masterSync
    };


    osc.send( {
      address: "/status",
      args: [ { type: 's', value: node.nid }, { type: 's', value: JSON.stringify( status ) } ]
    } );
  }, config.statusIntervalMs );
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

logger.info( "STARTED" );
logger.info( "config", config );
