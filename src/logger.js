var winston = require('winston');

var levels = { debug: 0, sync: 1, info: 2, warn: 3, error: 4, fatal: 5 };
var colors = { fatal: 'red', error: 'red', warn: 'yellow', sync: 'cyan', debug: 'blue' };
var timestamp = function() { return (new Date()).toISOString(); };

module.exports = new (winston.Logger)( {
  level: 'sync',
  levels: levels,
  colors: colors,
  transports: [
    new (winston.transports.Console)( {
      colorize: true,
      timestamp: timestamp
    } ),

    new(winston.transports.DailyRotateFile)( {
      filename: 'video-player',
      colorize: true,
      dirname: __dirname,
      timestamp: timestamp,
      maxFiles: 5
    } )
  ]
} );
