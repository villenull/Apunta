/**
 * The microphone tap: raw mono frames, forwarded to the page.
 *
 * This is the browser half of Apunta's answer to "how do we get 16 kHz mono
 * WAV without ffmpeg". The audio graph is created with
 * `new AudioContext({ sampleRate: 16000 })`, so Chrome resamples the
 * microphone for us and this processor sees frames already at the rate
 * whisper.cpp wants. `web/src/lib/recorder.ts` converts them to 16-bit PCM and
 * writes the 44-byte RIFF header itself.
 *
 * It lives in `public/` rather than in `src/` on purpose: an AudioWorklet
 * module is loaded by URL into a separate global scope with no module
 * resolution of its own, so it must reach the browser byte for byte as
 * written. Vite copies `public/` through untouched. Being a local asset, it
 * also stays inside hard rule 1 — nothing is fetched from a network.
 *
 * `render_quantum` is 128 frames (8 ms at 16 kHz). Posting each one would be
 * 125 messages a second, so frames are gathered into ~0.25 s blocks first.
 */

const BLOCK_FRAMES = 4096;

class PcmForwarder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(BLOCK_FRAMES);
    this.filled = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      // "flush": the page is stopping. Send the partial block so the last
      // fraction of a second of speech is not dropped on the floor.
      if (event.data === 'flush') {
        this.flush();
        this.stopped = true;
      }
    };
  }

  flush() {
    if (this.filled === 0) return;
    const frames = this.block.slice(0, this.filled);
    this.port.postMessage(frames, [frames.buffer]);
    this.filled = 0;
  }

  process(inputs) {
    if (this.stopped) return false;

    const channel = inputs[0] && inputs[0][0];
    // No input yet (the track is still starting) is not a reason to tear the
    // processor down: returning true keeps it alive for the next quantum.
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.block[this.filled] = channel[i];
      this.filled += 1;
      if (this.filled === BLOCK_FRAMES) this.flush();
    }
    return true;
  }
}

registerProcessor('pcm-forwarder', PcmForwarder);
