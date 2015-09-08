var dbus = require('dbus-native')
  , EventEmitter = require("events").EventEmitter
;

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
        this.emit( "non-fatal-error" );
        setTimeout( function() { this.create( tries ) }.bind( this ), 500 );
        return;
      } else {
        this.emit( "error") ;
        throw e;
      }
    }

    this.emit( "ready", this.dbus );

  } }
} );

module.exports = Bus;
