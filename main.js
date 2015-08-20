var omx = require('omxdirector')
  , osc = require('osc')
  , dbus = require('dbus-native')
  , fs = require('fs')
  , EventEmitter = require('events').EventEmitter
  , uuid = require('node-uuid')
  , logger = require('./src/logger')
  , PlayerController = require('./src/player_controller')
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
var oscRouter = new EventEmitter();
var oscPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: config.port,
  remoteAddress: '192.168.1.255',
  remotePort: config.port,
  broadcast: true
});
oscPort.on( "bundle", handleBundle );
oscPort.on( "message", handleMessage );
oscPort.on( "ready", function() { logger.info( "OSC sending and receiving on port " + config.port ); } );
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
function Bus() {
}

Bus.prototype = new EventEmitter();

Object.defineProperties( Bus.prototype, {
  invoke: { value: function() {
    this.dbus.invoke.apply( this.dbus, arguments );
  } },

  create: { value: function( tries ) {
    tries = tries === undefined ? 3 : tries;
    tries--;

    try {
      this.dbus = dbus.sessionBus({
        busAddress: fs.readFileSync('/tmp/omxplayerdbus.'+process.env.USER, 'ascii').trim()
      });
    } catch ( e ) {
      if ( e.code === "ENOENT" && tries >= 0 ) {
        logger.warn( "Could not connect to dbus, trying again." );
        setTimeout( function() { this.create( tries ) }.bind( this ), 500 );
        return;
      } else {
        logger.fatal( "Failed to connect to dbus." );
        throw e;
      }
    }

    this.emit( "ready", this.dbus );

  } }
} );

var bus = new Bus();


var controller = new PlayerController( bus, clock, omx, logger, config );

bus.on( "ready", function( dbus ) {
  controller.pollStatus();
} );

////////////////////////////////////////////////////////////////////////////////
// Node

var NODE_STATE = { master: 0, slave: 1, indeterminate: 2 };

function Node( options ) {
  this.heartbeatTimeout = options.heartbeatTimeout || 1000;
  this.electTimeout = options.electTimeout || 100;
  this.votingTimeout = options.votingTimeout || 750;
  this.state = NODE_STATE.indeterminate;
  this.id = uuid.v4();
  this.on( "heartbeat lost", this.elect.bind( this ) );
}

Node.prototype = new EventEmitter();

Object.defineProperties( Node.prototype, {
  elect: { value: function( cycle ) {
    cycle = cycle === undefined ? 0 : cycle;
    if ( cycle === 0 ) this.votes = 0;
    this.state = NODE_STATE.indeterminate;

    this.emit( "elect", this.id );
    this.__electTimeout = setTimeout( function() {
      this.elect( cycle + 1 );
    }.bind( this ), this.electTimeout );
  } },

  stopElection: { value: function() {
    clearTimeout( this.__electTimeout );
    clearTimeout( this.__votingTimeout );
  } },

  heartbeat: { value: function() {
    if ( this.__heartbeatTimeout ) clearTimeout( this.__heartbeatTimeout );

    this.__heartbeatTimeout = setTimeout( function(){
      this.emit( "heartbeat lost" )
    }.bind( this ), this.heartbeatTimeout );

    this.emit( "heartbeat" );
  } },

  votes: {
    get: function() { return this._votes; },
    set: function( v ) {
      this._votes = v;
      if ( this.__votingTimeout ) clearTimeout( this.__votingTimeout );
      this.__votingTimeout = setTimeout( function() {
        this.isMaster = true;
      }.bind( this ), this.votingTimeout );
    }
  },

  isMaster: {
    get: function() { return this.state === NODE_STATE.master; },
    set: function( v ) {
      this.state = v ? NODE_STATE.master : NODE_STATE.indeterminate;
      this.stopElection();
      this.emit( "master" );
    }
  },

  isIndeterminate: {
    get: function() { return this.state === NODE_STATE.indeterminate; }
  },

  isSlave: {
    get: function() { return this.state === NODE_STATE.slave; },
    set: function( v ) {
      this.state = v ? NODE_STATE.slave : NODE_STATE.indeterminate;
      this.stopElection();
      this.emit( "slave" );
    }
  }
} );

var node = new Node( { heartbeatTimeout: 1000 } );
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
  oscPort.send( {
    address: "/elect",
    args: [ { type: 's', value: id } ]
  } );
} );

controller.on( "status", function( status ) {
  if ( ! node.isMaster ) return;

  var elapsed = status.seconds
    , time = osc.timeTag( 0, status.time );

  oscPort.send( {
    address: "/sync",
    args: [ { type: 'f', value: elapsed }, { type: 't', value: time } ]
  } );
} );

bus.on( "ready", function() {
  oscRouter.on( "/sync", function( args ) {
    node.heartbeat();
    if ( node.isIndeterminate ) node.isSlave = true;
    if ( node.isSlave ) controller.synchronize( args[ 0 ], args[ 1 ].native );
  } );

  oscRouter.on( "/elect", function( args ) {
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
