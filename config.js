var FPS = 25;
module.exports = {
  fps: FPS,
  toleranceSecs: 1 / FPS,
  fineTuneToleranceSecs: 1,
  // partially dependent on the seek resolution of your video, ie. how many
  // keyframes it has.
  jumpToleranceSecs: 10,
  smoothingWindowMs: 1e3 / FPS * 10,
  loopDetectionMarginSecs: 2,
  port: 5000,
  filename: '/home/pi/video.mov',
  debug: false
}
