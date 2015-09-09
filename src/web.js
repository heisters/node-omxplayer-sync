var EventEmitter = require('events').EventEmitter
  , path = require('path')
  , express = require('express')
  , socketio = require('socket.io')
  , browserify = require('browserify-middleware')
  , DNS = require('./dns')
  , debug = require('debug')('web')
;

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
    if ( this.io ) this.io.sockets.emit( "status", status );
  } }
} );


module.exports = Web;
