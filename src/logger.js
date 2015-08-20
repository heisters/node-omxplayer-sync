var winston = require('winston');

var levels = { debug: 0, sync: 1, info: 2, warn: 3, error: 4, fatal: 5 };
var colors = { fatal: 'red', error: 'red', warn: 'yellow', sync: 'cyan', debug: 'blue' };

module.exports = new (winston.Logger)( {
  level: 'sync',
  levels: levels,
  colors: colors,
  transports: [
    new (winston.transports.Console)( {
      colorize: true,
      timestamp: function() { return (new Date()).toISOString(); }
    } )
  ]
} );
