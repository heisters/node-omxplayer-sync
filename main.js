var omx = require('omxdirector')
  , osc = require('osc')
  , dbus = require('dbus-native')
  , fs = require('fs')
  , merge = require('merge')
  , EventEmitter = require('events').EventEmitter
  , uuid = require('node-uuid')
  , logger = require('./logger')
  , Queue = require('./queue')
  , config = require('./config')
  , DEBUG = !!(config.debug || process.env.DEBUG)
;

if ( DEBUG ) logger.level = 'debug';

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

var INTERFACE_SHORT_TO_FULL = {
  properties: 'org.freedesktop.DBus.Properties',
  player: 'org.mpris.MediaPlayer2.Player'
};

function PlayerController( bus, clock ) {
  this.bus = bus;
  this.sync = { seconds: -1, time: -1 };
  this.master = { values: new Queue(), sums: { time: 0, seconds: 0 }, avgs: { time: 0, seconds: 0 } };
  this.speed = 0;
  this.clock = clock;
  this.waiting = false;
  this.on( "status", this.seekToMaster.bind( this ) );
}

PlayerController.prototype = new EventEmitter();

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

  pauseFor: { value: function( cb, ms, then ) {
    this.pause( function( err ) {
      if ( err ) {
        cb( err );

      } else {
        var waitFor = ms - ( this.clock.now() - then );
        setTimeout( function() {
          this.play( function() {} );
          cb();
        }.bind( this ), waitFor );
      }
    }.bind( this ) );
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
      if ( err ) logger.error( "Error setting position:", err );
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
          if ( err || usPosition > usDuration ) return;

          this.sync.seconds = usPosition / 1e6;
          this.sync.time = time;
          this.sync.positionUpdated = true;

          if ( this.localValid ) this.emit( "status", this.sync );
        }.bind( this ) );
      // don't try to hammer it at more than 2FPS or it's more error prone
      }.bind( this ), 1e3 / config.fps * 2 );
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

  localValid: {
    get: function() { return this.sync.positionUpdated; },
    set: function( v ) { return this.sync.positionUpdated = v; }
  },

  masterValid: {
    get: function() { return this.master.updated; },
    set: function( v ) { return this.master.updated = v; }
  },

  synchronize: { value: function( seconds, time ) {
    if ( ! this.clock.isSynchronized ) logger.sync( "clock to master time" );
    this.clock.sync( time ); // doesn't compensate for latency...


    // Calculate averages

    this.master.updated = true;
    this.master.values.enqueue( { seconds: seconds, time: time } );
    this.master.sums.time += time;
    this.master.sums.seconds += seconds;

    while ( this.master.values.length && this.master.values.peek().time < ( time - config.smoothingWindowMs ) ) {
      var v = this.master.values.dequeue();
      this.master.sums.time -= v.time;
      this.master.sums.seconds -= v.seconds;
    }

    var l = this.master.values.getLength();
    this.master.avgs.time = this.master.sums.time / l;
    this.master.avgs.seconds = this.master.sums.seconds / l;
  } },

  seekToMaster: { value: function() {
    if ( this.waiting || ! this.localValid || ! this.masterValid ) return;

    var now             = this.clock.now()
      , masterPosition  = this.master.avgs.seconds + ( now - this.master.avgs.time ) / 1e3
      , localPosition   = this.sync.seconds + ( now - this.sync.time ) / 1e3
      , delta           = localPosition - masterPosition
      , absDelta        = Math.abs( delta );


    this.localValid = this.masterValid = false;


    if ( absDelta < config.toleranceSecs ) {
      this.reset();
      return;
    }



    if ( absDelta < config.fineTuneToleranceSecs ) {

      logger.sync( "fine-tune", delta );

      if      ( delta > 0 && this.speed >= 0 ) this.slower()
      else if ( delta < 0 && this.speed <= 0 ) this.faster();


    } else if ( absDelta >= config.jumpToleranceSecs || delta < 0 ) {

      logger.sync( "jump", delta );

      this.setPosition( masterPosition );


    } else {

      logger.sync( "wait", delta );

      this.waiting = true;
      this.pauseFor( function() { this.waiting = false; }.bind( this ), delta * 1e3, now );

    }
  } },

  reset: { value: function() {
    this.play();
    while( this.speed < 0 ) this.faster();
    while( this.speed > 0 ) this.slower();
  } }

} );

var controller = new PlayerController( bus, clock );

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
