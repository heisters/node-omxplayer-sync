var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , path = require('path')
  , merge = require('merge')
  , express = require('express')
  , socketio = require('socket.io')
  , browserify = require('browserify-middleware')
  , DNS = require('./dns')
  , debug = require('debug')('web')
;

browserify.settings( {
  transform: [ [ require( 'browserify-css' ), { // use require to fix issue on Linux
    processRelativeUrl: function( relativeUrl ) {
      // remove node_modules/<module-name> from the path
      var regexp = /^node_modules\/(font-awesome)/;

      if ( ! regexp.test( relativeUrl ) ) return relativeUrl;
      return relativeUrl.replace( regexp, '' );
    }
  } ] ]
} );

function stripQueryStringAndHashFromPath (url) {
  return url.split('?')[0].split('#')[0];
}

function Web( options ) {
  EventEmitter.call( this );
  this.options = options;
  this.app = express();
  this.dir = path.resolve( __dirname + '/../html' );
  var modules = path.resolve( __dirname + '/../node_modules' );

  this.app.use( '/js', browserify( this.dir + '/js' ) );
  this.app.use( express.static( this.dir ) );
  // whitelist, directory structure hidden
  this.app.use( '/fonts', express.static( modules + '/font-awesome/fonts' ) );

  this.app.get( '/', function( req, res ) {
    debug( 'GET /: OK' );
    res.sendFile( this.dir + '/index.html' );
  }.bind( this ) );

  this.nodes = {};
}

util.inherits( Web, EventEmitter );

Object.defineProperties( Web.prototype, {
  master: { value: function( cb ) {
    if ( this.options.serviceName ) {
      this.dns = new DNS( this.options.serviceName, this.options.port );
      this.dns.listen( cb );
    }
  } },

  slave: { value: function() {
    this.closeDNS();
  } },

  closeDNS: { value: function() {
    if ( this.dns ) {
      this.dns.close();
      delete this.dns;
    }
  } },

  listen: { value: function( cb ) {
    this.serverListen( cb );
  } },

  close: { value: function() {
    this.server.close();
    this.closeDNS();
  } },

  serverListen: { value: function( cb ) {
    this.server = this.app.listen( this.options.port, function() {

      this.emit( "ready", this );
      if ( cb ) cb();

    }.bind( this ) );

    this.io = socketio( this.server );
    this.io.on( 'connection', function( socket ) {
      socket.on( 'command', this.onCommand.bind( this ) );
    }.bind( this ) );

  } },

  updateStatus: { value: function( nid, status ) {
    var s = merge( status, { lastSeen: Date.now() } );
    this.nodes[ nid ] = s;
    this.updateClientStatus();
  } },

  onCommand: { value: function( data ) {
    this.emit( "command", data.command );
  } },

  updateClientStatus: { value: function() {
    if ( this.__updateClientStatusInterval ) return;
    if ( ! this.io ) return;

    this.__updateClientStatusInterval = setInterval( function() {
      var time = Date.now();
      for ( var nid in this.nodes ) {
        if ( ! this.nodes.hasOwnProperty( nid ) ) continue;
        if ( this.nodes[ nid ].lastSeen < ( time - 1e3 ) ) delete this.nodes[ nid ];
      }

      this.io.sockets.emit( "status", { time: time, nodes: this.nodes } );
    }.bind( this ), 250 );
  } }
} );


module.exports = Web;
