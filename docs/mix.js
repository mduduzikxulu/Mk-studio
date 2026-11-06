/**
 * mix.js — Studio audio mixer
 *
 * Architecture overview
 * ─────────────────────
 * • All audio clip data lives in the `clips` array (plain objects, no classes).
 * • Decoded AudioBuffers are stored in `bufs`, keyed by a generated source id.
 * • Peak data (for waveform drawing) lives in `peaks`, same keys as `bufs`.
 * • The timeline is drawn on a <canvas> every frame during playback and on
 *   every state change at rest.  No virtual DOM, no frameworks.
 * • Undo / redo is implemented as a JSON snapshot stack (50 steps).
 *
 * Clip object shape
 * ─────────────────
 * {
 *   id:    number   — unique within the session
 *   src:   string   — key into `bufs` / `peaks`
 *   name:  string   — display name (file name without extension)
 *   start: number   — position on the timeline in seconds
 *   off:   number   — start offset into the source buffer in seconds
 *   dur:   number   — duration visible on the timeline in seconds
 *   lane:  number   — horizontal row (0 = top)
 *   vol:   number   — volume 0–200 (100 = normal)
 *   voice: boolean  — true = treated as the voice track for ducking
 * }
 */

'use strict';

// ── Shorthand ──────────────────────────────────────────────────────────────
const $ = (selector) => document.querySelector(selector);

// ── Audio context (created once at load, before any user gesture) ──────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const sharedAC = new AudioCtx();

// ── Timeline constants ─────────────────────────────────────────────────────
const LANE_H  = 70;   // height of each clip lane in canvas pixels
const RULER_H = 28;   // height of the ruler row at the top
const BLOCK   = 256;  // samples per peak bucket
const DPR     = window.devicePixelRatio || 1;

// Zoom levels: pixels-per-second at each step
const ZOOM_LEVELS = [6, 9, 12, 18, 26, 36, 52, 78, 110, 160, 220, 300];

// ── Mutable state ──────────────────────────────────────────────────────────
let clips    = [];       // all clips on the timeline
let bufs     = {};       // decoded AudioBuffer objects, keyed by src id
let peaks    = {};       // peak Float32Arrays, keyed by src id
let sel      = null;     // id of the currently selected clip (or null)
let zoomIdx  = 4;        // index into ZOOM_LEVELS
let pps      = ZOOM_LEVELS[zoomIdx]; // pixels per second (derived from zoomIdx)
let playhead = 0;        // playhead position in seconds
let playback = null;     // { c: AudioContext } when playing, null when stopped
let undoStack = [];      // array of JSON snapshots
let redoStack = [];
let nextId   = 1;        // monotonically incrementing clip/source id counter
let dragState = null;    // active pointer drag descriptor
let lastCanvasSize = ''; // cached "WxH" string to avoid redundant canvas resizes

// ── Mixer settings (not part of the undo history) ─────────────────────────
const mixSettings = {
  master: 100,   // master output volume 0–200
  duck:   false, // whether to enable auto-ducking
  depth:  25,    // how far music dips during ducking (percent)
};

// ── Canvas and timeline container ─────────────────────────────────────────
const canvas    = $('#cv');
const ctx       = canvas.getContext('2d');
const wrapEl    = $('#wrap');
const clipMenu  = $('#clip-menu');

// ── Dirty flag — prompt the user before navigating away with unsaved work ──
window.__studio_dirty = false;
const markDirty  = () => { window.__studio_dirty = true; };
const clearDirty = () => { window.__studio_dirty = false; };

// ──────────────────────────────────────────────────────────────────────────
// UTILITIES
// ──────────────────────────────────────────────────────────────────────────

/** Show a brief toast message at the bottom of the screen. */
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

/** Format seconds as MM:SS.s  e.g. 75.3 → "01:15.3" */
function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  return String(m).padStart(2, '0') + ':' + (secs - m * 60).toFixed(1).padStart(4, '0');
}

/** Number of lanes needed (at least 4, or one more than the furthest occupied lane). */
const laneCount = () => Math.max(4, Math.max(-1, ...clips.map(c => c.lane)) + 2);

/** Total timeline duration in seconds (end of the last clip). */
const totalDuration = () => Math.max(0, ...clips.map(c => c.start + c.dur));

/** Snap a time value to the current grid step. */
const gridStep = () => [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10].find(v => v * pps >= 10) || 10;
const snapTime = (t) => Math.max(0, Math.round(t / gridStep()) * gridStep());

/** Find a clip by id. */
const getClip = (id) => clips.find(c => c.id === id);

/** Return a unique clip colour based on clip index (golden-angle hue spread). */
const clipColor = (index) => `hsl(${(index * 137.508) % 360} 72% 62%)`;

// ──────────────────────────────────────────────────────────────────────────
// BARS CONTROL
// A custom mixer-style stepped slider rendered as a row of <i> elements.
//
// Parameters
//   el   — container element (will have .bars class added)
//   n    — number of segments
//   min  — minimum value
//   max  — maximum value
//   val  — initial value
//   hot  — value above which segments turn red (pass null to disable)
//   cb   — callback(newValue) called on every change
//
// Returns { set(v) } so callers can update the display programmatically.
// ──────────────────────────────────────────────────────────────────────────
function Bars(el, n, min, max, val, hot, cb) {
  el.classList.add('bars');
  el.innerHTML = '<i></i>'.repeat(n);
  const segments = [...el.children];
  let currentVal = val;

  // Round to nearest even step so the feel is clean (0, 2, 4 …)
  const snapVal = (raw) => {
    const step = Math.max(1, Math.round((max - min) / n));
    return Math.round(raw / step) * step;
  };

  const paint = () => {
    const filled = Math.round((currentVal - min) / (max - min) * n);
    segments.forEach((seg, i) => {
      const isOn  = i < filled;
      const isHot = hot != null && (min + (i + 1) * (max - min) / n) > hot;
      seg.className = (isOn ? 'on ' : '') + (isHot ? 'hot' : '');
    });
  };

  const applyPointer = (e) => {
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentVal = snapVal(min + (max - min) * ratio);
    paint();
    cb(currentVal);
  };

  el.onpointerdown = (e) => {
    el.setPointerCapture(e.pointerId);
    applyPointer(e);
    el.onpointermove = applyPointer;
  };
  el.onpointerup = () => { el.onpointermove = null; };

  paint();
  return { set(v) { currentVal = v; paint(); } };
}

// ──────────────────────────────────────────────────────────────────────────
// UNDO / REDO
// ──────────────────────────────────────────────────────────────────────────

/** Serialise the current clips array to a JSON string (snapshot). */
const snapshot = () => JSON.stringify(clips);

/**
 * Push a pre-action snapshot onto the undo stack if the state actually
 * changed since it was taken.
 */
function commit(pre) {
  if (pre !== snapshot()) {
    undoStack.push(pre);
    if (undoStack.length > 50) undoStack.shift(); // keep max 50 steps
    redoStack = [];
    markDirty();
  }
}

/**
 * Execute a function that mutates `clips`, then commit it to history.
 * Usage: act(() => { /* mutate clips *\/ });
 */
function act(fn) {
  const pre = snapshot();
  fn();
  commit(pre);
  refresh();
}

/**
 * Travel through history — used by both undo and redo.
 * Pops from `from` stack, restores state, pushes current state onto `to` stack.
 */
function travelHistory(from, to) {
  if (!from.length) return;
  to.push(snapshot());
  clips = JSON.parse(from.pop());
  if (!getClip(sel)) sel = null;
  markDirty();
  refresh();
}

// ──────────────────────────────────────────────────────────────────────────
// AUDIO — loading
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compute normalised peak values for a decoded AudioBuffer.
 * Returns a Float32Array where each element is the peak amplitude
 * of one BLOCK-sample window, normalised to [0, 1].
 */
function calcPeaks(buffer) {
  const data    = buffer.getChannelData(0);
  const buckets = Math.ceil(data.length / BLOCK);
  const peakArr = new Float32Array(buckets);
  let globalMax = 0.001;

  for (let i = 0; i < buckets; i++) {
    let bucketMax = 0;
    for (let j = i * BLOCK, end = Math.min(data.length, j + BLOCK); j < end; j += 4) {
      const v = Math.abs(data[j]);
      if (v > bucketMax) bucketMax = v;
    }
    peakArr[i] = bucketMax;
    if (bucketMax > globalMax) globalMax = bucketMax;
  }

  // Normalise so the loudest bucket reaches 1.0
  return peakArr.map(v => v / globalMax);
}

/**
 * Find the first free lane for a clip starting at `start` with duration `dur`.
 * Starts searching from lane `startLane` and increments until a gap is found.
 */
function freeLane(start, dur, startLane) {
  for (let lane = startLane; ; lane++) {
    const occupied = clips.some(
      q => q.lane === lane &&
           q.start < start + dur - 0.001 &&
           q.start + q.dur > start + 0.001
    );
    if (!occupied) return lane;
  }
}

/**
 * Decode and add a list of File objects to the timeline.
 * Each file is placed at the current playhead position and auto-assigned
 * to the first free lane.
 */
async function addFiles(fileList) {
  for (const file of fileList) {
    try {
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await sharedAC.decodeAudioData(arrayBuf);
      const srcId    = 's' + nextId++;

      bufs[srcId]  = audioBuf;
      peaks[srcId] = calcPeaks(audioBuf);

      act(() => {
        const clip = {
          id:    nextId++,
          src:   srcId,
          name:  file.name.replace(/\.[^.]+$/, ''), // strip file extension
          start: playhead,
          off:   0,
          dur:   audioBuf.duration,
          lane:  0,
          vol:   100,
          voice: false,
        };
        clip.lane = freeLane(clip.start, clip.dur, 0);
        clips.push(clip);
        sel = clip.id;
      });
    } catch (e) {
      toast('Could not read ' + file.name);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// AUDIO — ducking
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compute an RMS activity envelope for an AudioBuffer.
 * Returns { r: Float32Array of RMS values, th: activity threshold }.
 * Result is cached on the buffer object as `_a`.
 */
function getActivity(buffer) {
  if (buffer._a) return buffer._a;

  const data    = buffer.getChannelData(0);
  const winSize = Math.floor(buffer.sampleRate * 0.05); // 50 ms windows
  const count   = Math.floor(data.length / winSize);
  const rms     = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let sumSq = 0;
    for (let j = 0; j < winSize; j += 2) {
      const v = data[i * winSize + j];
      sumSq += v * v;
    }
    rms[i] = Math.sqrt(sumSq / (winSize / 2));
  }

  // Threshold = 12% of the 95th-percentile RMS value
  const sorted    = [...rms].sort((a, b) => a - b);
  const threshold = Math.max(0.008, sorted[Math.floor(count * 0.95)] * 0.12);

  return (buffer._a = { r: rms, th: threshold });
}

/**
 * Schedule gain automation on `gainParam` so music dips whenever a
 * voice clip is speaking (auto-ducking).
 *
 * @param {AudioParam} gainParam  — the GainNode.gain to automate
 * @param {number}     t0         — AudioContext time at which playback starts
 * @param {number}     from       — playhead offset in seconds
 */
function scheduleDucking(gainParam, t0, from) {
  // Collect all 50 ms windows where a voice clip is active
  const activeWindows = [];
  clips
    .filter(c => c.voice)
    .forEach(c => {
      const { r, th } = getActivity(bufs[c.src]);
      const startBucket = Math.floor(c.off / 0.05);
      const endBucket   = Math.min(r.length, Math.ceil((c.off + c.dur) / 0.05));

      for (let i = startBucket; i < endBucket; i++) {
        if (r[i] > th) {
          const t = c.start + i * 0.05 - c.off;
          activeWindows.push([t, t + 0.05]);
        }
      }
    });

  // Merge windows that are within 1 s of each other
  activeWindows.sort((a, b) => a[0] - b[0]);
  const merged = [];
  activeWindows.forEach(win => {
    const last = merged[merged.length - 1];
    if (last && win[0] - last[1] < 1) {
      last[1] = win[1]; // extend
    } else {
      merged.push([...win]);
    }
  });

  const lo = mixSettings.depth / 100; // target gain during ducking

  merged.forEach(([start, end]) => {
    const relStart = start - 0.1 - from;
    const relEnd   = end   + 0.05 - from;
    if (relEnd < 0) return; // entirely before playhead, skip

    const a = Math.max(0, relStart);
    const b = relEnd;

    gainParam.setValueAtTime(1,  t0 + a);
    gainParam.linearRampToValueAtTime(lo, t0 + a + 0.2);   // duck down over 200 ms
    gainParam.setValueAtTime(lo, t0 + b + 0.2);
    gainParam.linearRampToValueAtTime(1,  t0 + b + 0.8);   // recover over 800 ms
  });
}

// ──────────────────────────────────────────────────────────────────────────
// AUDIO — playback graph
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build the Web Audio graph for rendering or playback and schedule all clips.
 *
 * @param {BaseAudioContext} ac    — AudioContext or OfflineAudioContext
 * @param {number}           t0    — start time within the context
 * @param {number}           from  — playhead offset (0 = from the beginning)
 * @returns {number} total end time in seconds
 */
function buildAudioGraph(ac, t0, from) {
  const masterGain = ac.createGain();
  const voiceBus   = ac.createGain();
  const musicBus   = ac.createGain();

  masterGain.gain.value = mixSettings.master / 100;

  // When master > 100 % add a limiter to prevent clipping
  if (mixSettings.master > 100) {
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value      = 0;
    limiter.ratio.value     = 20;
    limiter.attack.value    = 0.002;
    limiter.release.value   = 0.12;
    masterGain.connect(limiter);
    limiter.connect(ac.destination);
  } else {
    masterGain.connect(ac.destination);
  }

  voiceBus.connect(masterGain);
  musicBus.connect(masterGain);

  let endTime = 0;

  clips.forEach(clip => {
    const clipEnd = clip.start + clip.dur;
    endTime = Math.max(endTime, clipEnd);
    if (clipEnd <= from) return; // clip is entirely before the playhead

    const source   = ac.createBufferSource();
    const clipGain = ac.createGain();
    const skip     = Math.max(0, from - clip.start); // how far into the clip to start

    source.buffer        = bufs[clip.src];
    clipGain.gain.value  = clip.vol / 100;

    source.connect(clipGain);
    clipGain.connect(clip.voice ? voiceBus : musicBus);

    source.start(
      t0 + Math.max(0, clip.start - from), // when in context time
      clip.off + skip,                      // offset into the buffer
      clip.dur - skip                       // duration to play
    );
  });

  if (mixSettings.duck) {
    scheduleDucking(musicBus.gain, t0, from);
  }

  return endTime;
}

// ──────────────────────────────────────────────────────────────────────────
// PLAYBACK CONTROLS
// ──────────────────────────────────────────────────────────────────────────

/** Start or resume playback from the current playhead position. */
function startPlayback() {
  stopPlayback(/* keepPlayhead */ true);
  if (!clips.length) return toast('Add some audio first');

  // If the playhead is past the end, restart from the beginning
  const from = playhead >= totalDuration() ? 0 : playhead;
  const ac   = new AudioCtx();
  const t0   = ac.currentTime + 0.05;
  const end  = buildAudioGraph(ac, t0, from);

  playback = { c: ac };
  $('#play').textContent = 'Pause';

  (function tick() {
    if (!playback || playback.c !== ac) return; // stale tick — bail out
    playhead = from + Math.max(0, ac.currentTime - t0);
    if (playhead >= end) {
      playhead = end;
      stopPlayback();
      return;
    }
    scrollToPlayhead();
    draw();
    $('#tc').textContent = fmtTime(playhead);
    requestAnimationFrame(tick);
  })();
}

/**
 * Stop playback.
 * @param {boolean} keepPlayhead — if true, don't reset the canvas
 */
function stopPlayback(keepPlayhead = false) {
  if (playback) {
    playback.c.close();
    playback = null;
  }
  $('#play').textContent = 'Play';
  if (!keepPlayhead) {
    draw();
    $('#tc').textContent = fmtTime(playhead);
  }
}

/** Scroll the timeline so the playhead stays visible. */
function scrollToPlayhead() {
  const px    = playhead * pps;
  const left  = wrapEl.scrollLeft;
  const width = wrapEl.clientWidth;
  if (px > left + width - 40 || px < left) {
    wrapEl.scrollLeft = Math.max(0, px - 60);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// EDITING ACTIONS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Detect a join seam: two adjacent clips on the same lane from the same source
 * whose boundary lies at the playhead.
 * Returns [left, right] clip pair or undefined.
 */
function findSeam() {
  for (const a of clips) {
    for (const b of clips) {
      if (
        a !== b &&
        a.src   === b.src &&
        a.lane  === b.lane &&
        Math.abs(a.start + a.dur - b.start) < 0.02 && // adjacent in time
        Math.abs(a.off   + a.dur - b.off)   < 0.02 && // adjacent in source
        Math.abs(playhead - b.start)         < 0.03    // playhead near the join
      ) return [a, b];
    }
  }
}

/**
 * Split the clip under the playhead, or join if the playhead is on a seam.
 * If no clip is selected, splits every clip that straddles the playhead.
 */
function doSplit() {
  const seam = findSeam();
  act(() => {
    if (seam) {
      // Join: extend the left clip and remove the right one
      seam[0].dur += seam[1].dur;
      clips = clips.filter(c => c !== seam[1]);
      sel = seam[0].id;
    } else {
      // Split: divide clips that the playhead passes through
      const straddles = (c) => playhead > c.start + 0.02 && playhead < c.start + c.dur - 0.02;
      const selected  = getClip(sel);
      const targets   = selected && straddles(selected) ? [selected] : clips.filter(straddles);

      targets.forEach(c => {
        const elapsed = playhead - c.start;
        const right   = { ...c, id: nextId++, start: playhead, off: c.off + elapsed, dur: c.dur - elapsed };
        c.dur = elapsed;
        clips.push(right);
        if (c.id === sel) sel = right.id;
      });
    }
  });
}

/** Duplicate the given clip (defaults to the selected clip). */
function doDuplicate(id = sel) {
  const clip = getClip(id);
  if (!clip) return;
  act(() => {
    const copy = { ...clip, id: nextId++, start: clip.start + clip.dur };
    copy.lane = freeLane(copy.start, copy.dur, clip.lane);
    clips.push(copy);
    sel = copy.id;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// EXPORT
// ──────────────────────────────────────────────────────────────────────────

/** Encode a stereo AudioBuffer as a WAV Blob. */
function encodeWav(buffer) {
  const numSamples = buffer.length;
  const L  = buffer.getChannelData(0);
  const R  = buffer.getChannelData(1);
  const pcm = new Int16Array(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    pcm[2 * i]     = Math.max(-1, Math.min(1, L[i])) * 32767;
    pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
  }

  // Build a 44-byte WAV header
  const header = new DataView(new ArrayBuffer(44));
  const writeStr = (offset, str) =>
    [...str].forEach((ch, i) => header.setUint8(offset + i, ch.charCodeAt(0)));

  writeStr(0,  'RIFF');
  header.setUint32(4,  36 + numSamples * 4, true); // total file size - 8
  writeStr(8,  'WAVEfmt ');
  header.setUint32(16, 16,                  true);  // PCM chunk size
  header.setUint16(20, 1,                   true);  // PCM format
  header.setUint16(22, 2,                   true);  // stereo
  header.setUint32(24, buffer.sampleRate,   true);
  header.setUint32(28, buffer.sampleRate * 4, true); // byte rate
  header.setUint16(32, 4,                   true);  // block align
  header.setUint16(34, 16,                  true);  // bits per sample
  writeStr(36, 'data');
  header.setUint32(40, numSamples * 4,      true);

  return new Blob([header, pcm], { type: 'audio/wav' });
}

/** Encode a stereo AudioBuffer as an MP3 Blob using lamejs. */
function encodeMp3(buffer) {
  const encoder  = new lamejs.Mp3Encoder(2, buffer.sampleRate, 192);
  const toInt16  = (floatArr) => {
    const out = new Int16Array(floatArr.length);
    for (let i = 0; i < floatArr.length; i++) {
      out[i] = Math.max(-1, Math.min(1, floatArr[i])) * 32767;
    }
    return out;
  };

  const L   = toInt16(buffer.getChannelData(0));
  const R   = toInt16(buffer.getChannelData(1));
  const out = [];

  for (let i = 0; i < L.length; i += 1152) {
    const chunk = encoder.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152));
    if (chunk.length) out.push(chunk);
  }
  out.push(encoder.flush());

  return new Blob(out, { type: 'audio/mpeg' });
}

/** Render the mix offline and trigger a browser download. */
async function exportMix(format) {
  if (!clips.length)        return toast('Nothing to export yet');
  if (format === 'mp3' && !window.lamejs)
    return toast('MP3 encoder did not load. Check your internet or use WAV.');

  stopPlayback();
  $('#xs').textContent = 'Rendering…';

  // Yield to the browser so the status text appears before the heavy work
  await new Promise(r => setTimeout(r, 20));

  const sampleRate = 44100;
  const length     = Math.ceil((totalDuration() + 0.05) * sampleRate);
  const offline    = new OfflineAudioContext(2, length, sampleRate);

  buildAudioGraph(offline, 0, 0);
  const rendered = await offline.startRendering();

  const blob = format === 'wav' ? encodeWav(rendered) : encodeMp3(rendered);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'studio-mix.' + format;
  a.click();

  $('#xs').textContent = 'Done. Saved studio-mix.' + format;
}

// ──────────────────────────────────────────────────────────────────────────
// CANVAS — layout & drawing
// ──────────────────────────────────────────────────────────────────────────

/** Resize the canvas if the container dimensions changed. */
function layoutCanvas() {
  const w   = wrapEl.clientWidth;
  const h   = RULER_H + laneCount() * LANE_H;
  const key = `${w}x${h}`;

  if (key !== lastCanvasSize) {
    lastCanvasSize     = key;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width        = w * DPR;
    canvas.height       = h * DPR;
  }

  // Keep the invisible sentinel div wide enough to allow horizontal scrolling
  $('#sp').style.width = Math.max(w, (totalDuration() + 14) * pps) + 'px';
}

/** Redraw the entire timeline canvas. */
function draw() {
  const w      = canvas.clientWidth;
  const h      = canvas.clientHeight;
  const scroll = wrapEl.scrollLeft;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // ── Background ──────────────────────────────────────────────
  ctx.fillStyle = '#14161a';
  ctx.fillRect(0, 0, w, h);

  // Alternating lane stripes
  for (let lane = 0; lane < laneCount(); lane++) {
    ctx.fillStyle = lane % 2 ? '#171a1f' : '#1a1d23';
    ctx.fillRect(0, RULER_H + lane * LANE_H, w, LANE_H);
  }

  // ── Ruler grid lines and time labels ────────────────────────
  const step    = gridStep();
  const majFreq = Math.ceil(72 / (step * pps)); // major line every ~72 px
  let lastLabelX = -999;

  ctx.font          = '11px Manrope,sans-serif';
  ctx.textBaseline  = 'top';

  const firstTick = Math.floor(scroll / pps / step);
  const lastTick  = Math.ceil((scroll + w) / pps / step);

  for (let i = firstTick; i <= lastTick; i++) {
    const rawPx  = i * step * pps - scroll;
    // Crisp lines: offset by 0.5px only when zoom is high enough to matter
    const px     = pps >= 16 ? Math.floor(rawPx) + 0.5 : Math.floor(rawPx);
    const isMajor = i % majFreq === 0;

    ctx.strokeStyle = isMajor ? 'rgba(55,62,76,0.28)' : 'rgba(30,35,44,0.18)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px, isMajor ? 8 : RULER_H - 4);
    ctx.lineTo(px, h);
    ctx.stroke();

    // Only draw a label when there's at least 52 px since the last one
    if (isMajor && px - lastLabelX > 52) {
      ctx.fillStyle = '#5a6270';
      ctx.fillText(fmtTime(i * step), px + 3, 7);
      lastLabelX = px;
    }
  }

  // ── Clips ────────────────────────────────────────────────────
  clips.forEach((clip, index) => {
    const color    = clipColor(index);
    const clipX    = clip.start * pps - scroll;
    const clipW    = clip.dur   * pps;

    // Skip clips that are entirely off-screen
    if (clipX > w || clipX + clipW < 0) return;

    const y0   = RULER_H + clip.lane * LANE_H + 4;
    const clipH = LANE_H - 8;
    const pk   = peaks[clip.src];
    const bucketSecs = BLOCK / bufs[clip.src].sampleRate;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, y0, clipW, clipH);
    ctx.clip(); // clip drawing to this clip's bounding box

    // Tinted fill
    ctx.fillStyle   = color;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(clipX, y0, clipW, clipH);
    ctx.globalAlpha = 1;

    // Waveform bars: 2 px wide, 1 px gap
    ctx.fillStyle  = color;
    const mid      = y0 + clipH / 2;
    const barWidth = 2;
    const barStep  = 3; // bar + gap

    const firstBar = Math.max(0, Math.floor(-clipX / barStep));
    const lastBar  = Math.min(clipW / barStep, (w - clipX) / barStep + 1);

    for (let i = firstBar; i < lastBar; i++) {
      const tStart = clip.off + i * barStep / pps;
      const tEnd   = tStart   + barStep / pps;
      let peakVal  = 0;

      for (
        let b = Math.floor(tStart / bucketSecs);
        b <= Math.min(pk.length - 1, Math.floor(tEnd / bucketSecs));
        b++
      ) {
        if (pk[b] > peakVal) peakVal = pk[b];
      }

      const barH = Math.max(1, peakVal * (clipH * 0.38));
      ctx.fillRect(clipX + i * barStep, mid - barH / 2, barWidth, barH);
    }

    // Clip label
    ctx.fillStyle = '#eafffb';
    ctx.font      = '11px Manrope,sans-serif';
    ctx.fillText(
      `Clip ${index + 1} - ${clip.voice ? '[voice] ' : ''}${clip.name}`,
      Math.max(clipX, 0) + 6,
      y0 + 3
    );

    ctx.restore();

    // Selection outline + drag handles
    if (clip.id === sel) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.strokeRect(clipX + 1, y0 + 1, clipW - 2, clipH - 2);
      ctx.lineWidth = 1;

      // Left and right resize handles
      ctx.fillStyle = color;
      ctx.fillRect(clipX,          y0 + clipH / 2 - 10, 5, 20);
      ctx.fillRect(clipX + clipW - 5, y0 + clipH / 2 - 10, 5, 20);
    }
  });

  // Empty state hint
  if (!clips.length) {
    ctx.fillStyle  = '#8f97a6';
    ctx.font       = '16px Manrope,sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText('Drop audio files here, or press Add audio', w / 2, RULER_H + LANE_H * 1.4);
    ctx.textAlign  = 'left';
  }

  // ── Playhead ─────────────────────────────────────────────────
  const phX = playhead * pps - scroll;
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(phX - 1, 0, 2, h);

  // Playhead triangle at the top
  ctx.beginPath();
  ctx.moveTo(phX - 6, 0);
  ctx.lineTo(phX + 6, 0);
  ctx.lineTo(phX, 9);
  ctx.fill();
}

// ──────────────────────────────────────────────────────────────────────────
// REFRESH — sync all UI elements with current state
// ──────────────────────────────────────────────────────────────────────────

/**
 * Called after every state change.
 * Updates button states, labels, bars controls, and redraws the canvas.
 * If playback is active it restarts from the current position to pick up
 * any clip changes.
 */
function refresh() {
  layoutCanvas();

  const clip = getClip(sel);
  const seam = findSeam();

  // Toolbar button states
  $('#split').textContent  = seam ? 'Join' : 'Trim here';
  $('#voice').textContent  = clip && clip.voice ? 'Unmark voice' : 'Mark as voice';
  ['dup', 'del', 'voice'].forEach(id => $('#' + id).disabled = !clip);
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;

  // Selected clip info panel
  $('#cn').textContent  = clip ? clip.name : 'Click a clip to select it';
  clipVolBar.set(clip ? clip.vol : 100);
  $('#cvl').textContent = 'Clip volume ' + (clip ? clip.vol : 100) + '%';

  // Time counter
  $('#tc').textContent = fmtTime(playhead);

  draw();

  // Restart playback so new clip positions / volumes are heard immediately
  if (playback) {
    const pos = playhead;
    startPlayback();
    playhead = pos;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POINTER INTERACTION — hit testing and drag handling
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hit-test a pointer event against the canvas.
 * Returns an object describing what was hit:
 *   { ruler: true }               — ruler row
 *   { c: clip, mode: 'l'|'m'|'r' } — clip (left handle, body, right handle)
 *   { empty: true }               — empty lane area
 */
function hitTest(e) {
  const rect   = canvas.getBoundingClientRect();
  const px     = e.clientX - rect.left;
  const py     = e.clientY - rect.top;
  const scroll = wrapEl.scrollLeft;

  if (py < RULER_H) return { px, py, ruler: true };

  const lane = Math.floor((py - RULER_H) / LANE_H);

  // Iterate in reverse so topmost (last rendered) clips are hit first
  for (const clip of [...clips].reverse()) {
    const clipX = clip.start * pps - scroll;
    const clipW = clip.dur   * pps;

    if (clip.lane === lane && px >= clipX && px <= clipX + clipW) {
      const mode = px - clipX < 8 ? 'l' : clipX + clipW - px < 8 ? 'r' : 'm';
      return { px, py, c: clip, mode };
    }
  }

  return { px, py, empty: true };
}

// ── Right-click / context menu ─────────────────────────────────────────────

function closeClipMenu() {
  clipMenu.hidden = true;
}

function showClipMenu(e) {
  const hit = hitTest(e);
  if (!hit.c) { closeClipMenu(); return; }

  e.preventDefault();
  sel      = hit.c.id;
  playhead = snapTime((hit.px + wrapEl.scrollLeft) / pps);
  refresh();

  // Update label in the menu to reflect join vs split state
  clipMenu.querySelector('[data-action="split"]').textContent =
    findSeam() ? 'Join here' : 'Trim here';
  clipMenu.querySelector('[data-action="voice"]').textContent =
    hit.c.voice ? 'Unmark as voice' : 'Mark as voice';

  // Position the menu, keeping it fully within the viewport
  clipMenu.hidden = false;
  clipMenu.style.left = '0px';
  clipMenu.style.top  = '0px';
  const bounds = clipMenu.getBoundingClientRect();
  clipMenu.style.left = Math.max(8, Math.min(e.clientX, innerWidth  - bounds.width  - 8)) + 'px';
  clipMenu.style.top  = Math.max(8, Math.min(e.clientY, innerHeight - bounds.height - 8)) + 'px';

  // Store the playhead time so menu actions use the same position
  clipMenu.dataset.time = String(playhead);
}

canvas.oncontextmenu = showClipMenu;

document.addEventListener('pointerdown', (e) => {
  if (!clipMenu.hidden && !clipMenu.contains(e.target)) closeClipMenu();
});

clipMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  closeClipMenu();

  switch (btn.dataset.action) {
    case 'split':
      playhead = Number(clipMenu.dataset.time);
      refresh();
      doSplit();
      break;
    case 'duplicate': doDuplicate(); break;
    case 'voice':     $('#voice').click(); break;
    case 'delete':    $('#del').click();   break;
  }
});

// ── Drag (move / resize / scrub) ──────────────────────────────────────────

canvas.onpointerdown = (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);

  const hit  = hitTest(e);
  const time = (hit.px + wrapEl.scrollLeft) / pps;

  if (hit.c) {
    // Start dragging a clip
    sel       = hit.c.id;
    dragState = { mode: hit.mode, pre: snapshot(), origin: { ...hit.c }, startTime: time };
    refresh();
  } else {
    // Click on ruler or empty lane — move playhead
    if (hit.empty) sel = null;
    playhead  = snapTime(time);
    dragState = { mode: 'scrub' };
    refresh();
  }
};

canvas.onpointermove = (e) => {
  const hit  = hitTest(e);
  const time = (hit.px + wrapEl.scrollLeft) / pps;

  if (!dragState) {
    // Hover: update cursor style
    canvas.style.cursor = hit.c
      ? (hit.mode === 'm' ? 'grab' : 'ew-resize')
      : 'default';
    return;
  }

  if (dragState.mode === 'scrub') {
    playhead = snapTime(time);
    $('#tc').textContent = fmtTime(playhead);
    draw();
    return;
  }

  const clip = getClip(sel);
  const orig = dragState.origin;
  const buf  = bufs[clip.src];

  if (dragState.mode === 'm') {
    // Move: shift start time and snap to lane
    clip.start = snapTime(orig.start + time - dragState.startTime);
    clip.lane  = Math.max(0, Math.min(11, Math.floor((hit.py - RULER_H) / LANE_H)));

  } else if (dragState.mode === 'l') {
    // Trim left edge: move start and adjust offset so the audio stays in place
    let delta = snapTime(time) - orig.start;
    delta = Math.max(-orig.off, Math.min(orig.dur - 0.05, delta));
    clip.start = orig.start + delta;
    clip.off   = orig.off   + delta;
    clip.dur   = orig.dur   - delta;

  } else {
    // Trim right edge: adjust duration only
    clip.dur = Math.max(0.05, Math.min(buf.duration - orig.off, snapTime(time) - orig.start));
  }

  layoutCanvas();
  draw();
};

canvas.onpointerup = () => {
  if (dragState && dragState.pre) commit(dragState.pre);
  refresh();
  dragState = null;
};

// Double-click on a clip duplicates it
canvas.ondblclick = (e) => {
  const hit = hitTest(e);
  if (hit.c) doDuplicate(hit.c.id);
};

// Redraw on scroll / resize
wrapEl.onscroll = draw;
addEventListener('resize', () => { layoutCanvas(); draw(); });

// ──────────────────────────────────────────────────────────────────────────
// ZOOM
// ──────────────────────────────────────────────────────────────────────────

/**
 * Set zoom to a given level index, keeping the view centred on `anchorX`
 * (canvas x coordinate) where possible.
 */
function setZoom(newIdx, anchorX) {
  newIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, newIdx));
  const timeAtAnchor = (wrapEl.scrollLeft + anchorX) / pps;
  zoomIdx = newIdx;
  pps     = ZOOM_LEVELS[zoomIdx];
  zoomBar.set(zoomIdx);
  layoutCanvas();
  wrapEl.scrollLeft = timeAtAnchor * pps - anchorX;
  draw();
}

// Ctrl/Cmd + scroll wheel zooms
wrapEl.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const anchorX = e.clientX - wrapEl.getBoundingClientRect().left;
    setZoom(zoomIdx + (e.deltaY < 0 ? 1 : -1), anchorX);
  }
}, { passive: false });

// ──────────────────────────────────────────────────────────────────────────
// CONTROLS — wire up all buttons, bars and inputs
// ──────────────────────────────────────────────────────────────────────────

// Zoom bar
const zoomBar = Bars($('#zb'), ZOOM_LEVELS.length - 1, 0, ZOOM_LEVELS.length - 1, zoomIdx, null, (v) => {
  setZoom(Math.round(v), wrapEl.clientWidth / 2);
});

// Clip volume bar
// `volPre` stores a pre-drag snapshot for undo on pointer-up
let volPre = null;
const clipVolBar = Bars($('#cvb'), 50, 0, 200, 100, 100, (v) => {
  const clip = getClip(sel);
  if (!clip) return;
  if (volPre === null) volPre = snapshot();
  clip.vol = v;
  $('#cvl').textContent = 'Clip volume ' + v + '%';
});

$('#cvb').addEventListener('pointerup', () => {
  if (volPre !== null) {
    commit(volPre);
    volPre = null;
    refresh();
  }
});

// Music depth bar (how far music dips during ducking)
Bars($('#db'), 20, 5, 80, 25, null, (v) => {
  mixSettings.depth = v;
  $('#dl').textContent = mixSettings.duck
    ? `Music drops to ${v}% while the voice speaks.`
    : 'Off: music plays at a steady level.';
});

// Duck toggle
$('#duck').onchange = (e) => {
  mixSettings.duck = e.target.checked;
  $('#dl').textContent = mixSettings.duck
    ? `Mark a clip as voice, then music drops to ${mixSettings.depth}% while it speaks.`
    : 'Off: music plays at a steady level.';
  if (playback) startPlayback();
};

// File picker
$('#add').onclick  = () => $('#file').click();
$('#file').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };

// Drag-and-drop anywhere on the page
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop',     (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

// History
$('#undo').onclick = () => travelHistory(undoStack, redoStack);
$('#redo').onclick = () => travelHistory(redoStack, undoStack);

// Edit actions
$('#split').onclick = doSplit;
$('#dup').onclick   = () => doDuplicate();
$('#del').onclick   = () => act(() => { clips = clips.filter(c => c.id !== sel); sel = null; });
$('#voice').onclick = () => act(() => { const c = getClip(sel); c.voice = !c.voice; });

// Playback
$('#play').onclick = () => playback ? stopPlayback() : startPlayback();
$('#stop').onclick = () => {
  stopPlayback();
  playhead = 0;
  wrapEl.scrollLeft = 0;
  refresh();
};

// Export
$('#xw').onclick = () => exportMix('wav');
$('#xm').onclick = () => exportMix('mp3');

// Zoom buttons
$('#zi').onclick = () => {
  // Step up to the next level whose pps is at least double the current
  let next = zoomIdx;
  ZOOM_LEVELS.forEach((v, i) => { if (v <= pps * 2) next = i; });
  setZoom(Math.min(ZOOM_LEVELS.length - 1, next + 1), wrapEl.clientWidth / 2);
};
$('#zo').onclick = () => {
  // Step down to the first level whose pps is at most half the current
  let next = 0;
  ZOOM_LEVELS.forEach((v, i) => { if (v >= pps / 2 && next === 0) next = i; });
  setZoom(Math.max(0, next - 1), wrapEl.clientWidth / 2);
};
$('#fit').onclick = () => {
  // Zoom to fit the entire mix in the current viewport
  const total = Math.max(totalDuration(), 5);
  const want  = (wrapEl.clientWidth - 30) / total;
  let best    = 0;
  ZOOM_LEVELS.forEach((v, i) => { if (v <= want) best = i; });
  setZoom(best, 0);
  wrapEl.scrollLeft = 0;
  draw();
};

// ──────────────────────────────────────────────────────────────────────────
// ALL VOLUME DIALOG
// ──────────────────────────────────────────────────────────────────────────

const volumeDialog = $('#volume-dialog');
const volumeList   = $('#volume-list');
const masterSlider = $('#master-volume');

/**
 * Rebuild the volume panel to reflect current clip list.
 * Called each time the dialog is opened.
 */
function renderVolumePanel() {
  volumeList.replaceChildren();

  clips.forEach((clip, index) => {
    const row = document.createElement('div');
    row.className = 'volume-row clip-volume-row';
    row.style.setProperty('--clip-color', clipColor(index));

    // Header: clip number, name, current value
    const head     = document.createElement('div');
    head.className = 'volume-row-head';

    const identity  = document.createElement('div');
    identity.className = 'volume-identity';
    const numEl   = document.createElement('strong');
    numEl.textContent = 'Clip ' + (index + 1);
    const nameEl  = document.createElement('small');
    nameEl.textContent = clip.name;
    const valueEl = document.createElement('output');
    valueEl.textContent = clip.vol + '%';

    identity.append(numEl, nameEl);
    head.append(identity, valueEl);

    // Range slider
    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = '0';
    slider.max   = '200';
    slider.step  = '1';
    slider.value = String(clip.vol);
    slider.setAttribute('aria-label', `Clip ${index + 1} volume`);

    let before = null;
    const beginEdit = () => { if (before === null) before = snapshot(); };

    slider.addEventListener('pointerdown', beginEdit);
    slider.addEventListener('keydown',     beginEdit);
    slider.addEventListener('input', () => {
      beginEdit();
      clip.vol = Number(slider.value);
      valueEl.textContent = clip.vol + '%';

      // Keep the inline bar in sync if this is the selected clip
      if (getClip(sel) === clip) {
        $('#cvl').textContent = 'Clip volume ' + clip.vol + '%';
        clipVolBar.set(clip.vol);
      }
    });
    slider.addEventListener('change', () => {
      if (before !== null) { commit(before); before = null; refresh(); }
    });

    row.append(head, slider);
    volumeList.appendChild(row);
  });

  // Sync master slider display
  masterSlider.value           = String(mixSettings.master);
  $('#master-value').textContent = mixSettings.master + '%';
}

masterSlider.addEventListener('input', () => {
  mixSettings.master = Number(masterSlider.value);
  $('#master-value').textContent = mixSettings.master + '%';
});
masterSlider.addEventListener('change', () => { if (playback) startPlayback(); });

$('#allvol').onclick   = () => { renderVolumePanel(); volumeDialog.showModal(); };
$('#close-vol').onclick = () => volumeDialog.close();

// ──────────────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ──────────────────────────────────────────────────────────────────────────

addEventListener('keydown', (e) => {
  // Don't intercept shortcuts when typing in a text field
  if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'checkbox') return;

  const key  = e.key.toLowerCase();
  const mod  = e.ctrlKey || e.metaKey;

  if (mod && key === 'z') {
    e.preventDefault();
    travelHistory(e.shiftKey ? redoStack : undoStack, e.shiftKey ? undoStack : redoStack);
  } else if (mod && key === 'y') {
    e.preventDefault();
    travelHistory(redoStack, undoStack);
  } else if (key === ' ') {
    e.preventDefault();
    playback ? stopPlayback() : startPlayback();
  } else if (key === 's' && !mod) {
    doSplit();
  } else if (key === 'd' && !mod) {
    doDuplicate();
  } else if ((key === 'delete' || key === 'backspace') && sel) {
    $('#del').click();
  }
});

// ──────────────────────────────────────────────────────────────────────────
// INITIALISE
// ──────────────────────────────────────────────────────────────────────────
layoutCanvas();
refresh();
window.__studio_dirty = false; // don't prompt on first load
