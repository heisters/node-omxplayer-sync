var EventEmitter = require('events').EventEmitter
  , express = require('express')
  , DNS = require('./dns')
  , debug = require('debug')('web')
;


function Web( options ) {
  this.options = options;
  this.app = express();
  this.app.get('/', function( req, res ) {
    debug( 'GET /: OK' );
    res.send( 'Hi' );
  } );

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
  } }
} );


module.exports = Web;
