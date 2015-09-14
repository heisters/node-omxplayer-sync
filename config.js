var FPS = 25
  , merge = require('merge')
  , overrides = {}
;
try { overrides = require('./config.local') } catch (e) { }

module.exports = merge( {
  fps: FPS,
  toleranceSecs: 1 / FPS,
  fineTuneToleranceSecs: 1,
  // partially dependent on the seek resolution of your video, ie. how many
  // keyframes it has.
  jumpToleranceSecs: 10,
  smoothingWindowMs: 1e3 / FPS * 10,
  loopDetectionMarginSecs: 2,
  port: 5000,
  broadcastAddress: '255.255.255.255',
  filename: '/home/pi/video.mov',
  statusIntervalMs: 250,
  debug: false,
  webPort: 8080
}, overrides );
