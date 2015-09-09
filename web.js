var Web = require('./src/web')
;

var web = new Web( { port: 8080 /*, serviceName: 'cluster' */ } );
web.listen();
