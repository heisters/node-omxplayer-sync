var FPS = 25;
module.exports = {
  fps: FPS,
  toleranceSecs: 1 / FPS,
  fineTuneToleranceSecs: 1,
  // partially dependent on the seek resolution of your video, ie. how many
  // keyframes it has.
  jumpToleranceSecs: 20,
  smoothingWindowMs: 1e3 / FPS * 10,
  port: 5000,
  filename: '/home/pi/test_very_short.mp4',
  debug: false
}
