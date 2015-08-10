var port = process.argv[2]
  , address = '0.0.0.0'
  , dgram = require('dgram')
;

if ( port === undefined ) {
  console.log( "Please specify a port." );
  console.log( process.argv[1] + " [PORT]" );
  process.exit(1);
}

var server = dgram.createSocket('udp4')
server.on("listening", function() {
  var a = server.address();
  console.log( "Listening on " + a.address + ":" + a.port );
});

server.on("message", function(message, remote) {
  console.log( remote.address + ":" + remote.port + " - " + message );
});

server.bind(port, address);


