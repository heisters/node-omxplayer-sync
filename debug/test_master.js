var osc = require('osc')
  , start = Date.now()
;

var oscPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: 5000,
  remoteAddress: '192.168.1.255',
  remotePort: 5000,
  broadcast: true
});
oscPort.on("open", function(socket) {
  setInterval( function() {
    var now = Date.now()
      , elapsed = (now - start) / 1000
      , nowtt = osc.timeTag( 0 )
    ;
    console.log( { elapsed: elapsed, now: now, nowtt: nowtt } );
    oscPort.send({
      address: "/sync",
      args: [ { type: 'f', value: elapsed }, { type: 't', value: nowtt } ]
    });
  }, 1000 / 25 * 7 );
});

oscPort.open();

