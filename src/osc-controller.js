var osc = require('osc')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
;

function OSCController( clock, options ) {
  EventEmitter.call( this );
  this.clock = clock;
  this.port = new osc.UDPPort( options );
  this.port.on( "bundle", this.handleBundle.bind( this ) );
  this.port.on( "message", this.handleMessage.bind( this ) );
  this.port.on( "ready", function() { this.emit( "ready" ); }.bind( this ) );
}

util.inherits( OSCController, EventEmitter );

Object.defineProperties( OSCController.prototype, {
  handleMessage: { value: function( message ) {
    this.emit( message.address, message.args );
  } },

  handleBundle: { value: function( bundle ) {
    var delta = this.clock.now() - bundle.timeTag.native;

    if ( delta <= 0 ) {
      bundle.packets.forEach( this.handlePacket.bind( this ) );
    } else {
      setTimeout( function() { this.handleBundle( bundle ); }.bind( this ), delta );
    }
  } },

  handlePacket: { value: function( packet ) {
    packet.address ?  this.handleMessage( packet ) : this.handleBundle( packet );
  } },

  open: { value: function() {
    this.port.open.apply( this.port, arguments );
  } },

  send: { value: function() {
    this.port.send.apply( this.port, arguments );
  } },

  timeTag: { value: function() {
    return osc.timeTag.apply( osc, arguments );
  } }
} );

module.exports = OSCController;
