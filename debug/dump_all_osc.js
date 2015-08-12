var osc = require('osc')
  , port = process.argv[2];

if ( port === undefined ) {
  console.log( "Please specify a port." );
  console.log( process.argv[1] + " [PORT]" );
  process.exit(1);
}

var oscPort = new osc.UDPPort( {
  localAddress: '0.0.0.0',
  localPort: port,
} );

oscPort.on( "bundle", function( b ) {
  console.log( "BUNDLE: %j", b );
} );

oscPort.on( "message", function( m ) {
  console.log( "MESSAGE: %j", m );
} );

oscPort.on( "ready", function() { console.log( "OSC receiving on port " + port ); } );

oscPort.open();
