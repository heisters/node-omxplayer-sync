Node.js OMXPlayer Synchronization
=================================

This repo contains code for using Raspberry Pis to create low-cost,
highly scalable video walls or multi-channel video installations. Setup
is simple, and the software takes care of the details for you:

1. Get a TV or computer monitor with an HDMI input. Better yet, get 10.
   Or 100.
2. Plug a Pi into each screen.
3. Connect the Pis to a network, load the software onto them, and copy
   your video files onto the Pis.
4. Start the Pis.

The Pis will talk to eachother over the network using a simple
peer-to-peer protocol to figure out how to stay in sync. You can remove
and add Pis while the cluster is running, and they will quickly fall
into sync with the other Pis.

Technical Overview
------------------

The control software is written in Node.js, uses OMXPlayer to play the
video, and OSC to talk over the network. The controller uses a
dumbed-down consensus algorithm to elect a peer as master, which all the
other Pis become slaves to, syncing their video by seeking, pausing, and
slightly tweaking their play speed.

To make management of the cluster easier, there is a [system automation
tool](https://github.com/heistes/node-omxplayer-sync-devops) that uses
Ansible to provision, deploy, and configure many Pis at the same time.

Setup
-----

1. Edit `config.local.js` to use the filename of your video file. See
   `config.js` for a list of other available settings.
2. Copy your video file to the pi.
3. Start the service using `node main.js` or use ansible.

Notes
-----

Video files should not be temporally compressed (eg. MJPEG or Apple
PRORES), or they should have a very low GOP length (the interval between
i-frames or keyframes). You can use `script/get_keyframe_intervals` to
inspect the GOP of a file (depends on ffmpeg and ffprobe).

Configuration
-------------

Default configuration resides in [config.js](config.js). The default
configuration can be overriden by creating a `config.local.js` file. See
documentation in [config.js](config.js) for details on each setting. The
configuration files are JavaScript to allow settings based on
calculations. This means that you need to be sure your configuration is
valid JavaScript, or the whole configuration file will be ignored.

An example `config.local.js` file:

    var FPS = 29.97;

    module.exports = {
      fps: FPS,
      toleranceSecs: 1 / FPS * 3,
      smoothingWindowMs: 1e3 / FPS * 15
    };
