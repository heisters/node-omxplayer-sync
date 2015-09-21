var FPS = 25
  , merge = require('merge')
  , overrides = {}
;
try { overrides = require('./config.local') } catch (e) { }

module.exports = merge( {
  // The framerate of your video files. Usually something like 25, 29.97 or 30.
  // Note that omxplayer does not support framerates over 30.
  fps: FPS,
  // How much sync difference to tolerate before trying to correct. Higher
  // values will cause fewer, larger corrections, while lower values may cause
  // continuous small corrections. This value depends on your video file and
  // the latency of the network the pis are on. The default is to tolerate one
  // frame of difference.
  toleranceSecs: 1 / FPS,
  // When players are out of sync by more than this many seconds, the software
  // will jump or pause to sync up, instead of trying to speed up or slow down
  // to get synchronized.
  fineTuneToleranceSecs: 1,
  // Do not try jumping if the sync is off by less than this. This is partially
  // dependent on the seek resolution of your video, ie. how frequent its
  // keyframes are. With infrequent keyframes, jumping can just make sync worse
  // because the software can't accurately jump to the right position. With
  // keyframes that are very frequent (say, every frame, or every other frame)
  // it can be safe to have this pretty low, but it may cause some choppiness
  // when syncing.
  jumpToleranceSecs: 10,
  // The sync signal is averaged over this many milliseconds in order to filter
  // out irregularities caused by the network. Higher values will make playback
  // smoother, but less accurately synced.
  smoothingWindowMs: 1e3 / FPS * 10,
  // The UDP port to use for communication. To setup multiple, independent
  // clusters on the same network, you can just give them each different ports.
  port: 5000,
  // The UDP broadcast IP to use for broadcasting messages to other players.
  // 255.255.255.255 should work for most networks, but you may need to modify
  // this for some network configurations.
  broadcastAddress: '255.255.255.255',
  // The filename to play. Probably easiest to leave this the same on every
  // player and just rename your file to match.
  filename: '/home/pi/video.mov',
  // The hostname the master will be available at on the network. '.local' will
  // be appended.
  serviceName: 'players',

  // ---------------------------------------------------------------------------
  // Nothing below here should need to be changed.

  loopDetectionMarginSecs: 0.5,
  statusIntervalMs: 250,
  debug: false,
  webPort: 8080
}, overrides );
