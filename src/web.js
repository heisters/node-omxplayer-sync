var EventEmitter = require('events').EventEmitter
  , path = require('path')
  , merge = require('merge')
  , express = require('express')
  , socketio = require('socket.io')
  , browserify = require('browserify-middleware')
  , DNS = require('./dns')
  , debug = require('debug')('web')
  , browserifyCSS = require('browserify-css')
;

browserify.settings( {
  transform: [ browserifyCSS ]
} );

function Web( options ) {
  this.options = options;
  this.app = express();
  this.dir = path.resolve( __dirname + '/../html' );

  this.app.use( '/js', browserify( this.dir + '/js' ) );

  this.app.get( '/', function( req, res ) {
    debug( 'GET /: OK' );
    res.sendFile( this.dir + '/index.html' );
  }.bind( this ) );


  if ( options.serviceName ) {
    this.dns = new DNS( options.serviceName, options.port );
  }

  this.nodes = {};
}

Web.prototype = new EventEmitter();

Object.defineProperties( Web.prototype, {
  listen: { value: function( cb ) {
    if ( this.dns ) {
      this.dns.listen( function() { this.serverListen( cb ); }.bind( this ) );
    } else {
      this.serverListen( cb );
    }
  } },

  serverListen: { value: function( cb ) {
    this.server = this.app.listen( this.options.port, function() {

      this.emit( "ready", this );
      if ( cb ) cb();

    }.bind( this ) );

    this.io = socketio( this.server );
    //this.io.on( 'connection', function( socket ) { } );

  } },

  updateStatus: { value: function( nid, status ) {
    var s = merge( status, { lastSeen: Date.now() } );
    this.nodes[ nid ] = s;
    this.updateClientStatus();
  } },

  updateClientStatus: { value: function() {
    if ( this.__updateClientStatusInterval ) return;
    if ( ! this.io ) return;

    this.__updateClientStatusInterval = setInterval( function() {
      for ( var nid in this.nodes ) {
        if ( ! this.nodes.hasOwnProperty( nid ) ) continue;
        if ( this.nodes[ nid ].lastSeen < ( Date.now() - 1e3 ) ) delete this.nodes[ nid ];
      }
      this.io.sockets.emit( "status", this.nodes );
    }.bind( this ), 250 );
  } }
} );


module.exports = Web;
