var Web = require('./src/web')
  , Clock = require('./src/clock')
  , OSCController = require('./src/osc-controller')
  , config = require('./config')
;

var osc = new OSCController( new Clock(), {
  localAddress: '0.0.0.0',
  localPort: config.port,
  remoteAddress: config.broadcastAddress,
  remotePort: config.port,
  broadcast: true
} );
osc.open();

var web = new Web( { port: config.webPort /*, serviceName: 'cluster' */ } );
web.listen();

osc.on( "/status", function( args ) {
  var nid = args[ 0 ];
  try {
    var status = JSON.parse( args[ 1 ] );
  } catch ( e ) {
    logger.error( "invalid status message %s", args[ 1 ] );
  }

  web.updateStatus( nid, status );
} );
