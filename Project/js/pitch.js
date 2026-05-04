/* ====================================================
   pitch.js — Chromatic Tuner (stable state-machine)
   SILENT → SEARCHING → LOCKED
   Only reports sharp/flat once the note is confidently
   locked — eliminates jitter at low volumes.
==================================================== */

// ── NOTE TABLES ──────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

function noteFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function freqToMidi(freq) {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}
function midiToName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// ── STATE ────────────────────────────────────────────
let audioCtx     = null;
let analyserNode = null;
let micStream    = null;
let animFrameId  = null;
let isListening  = false;
let cooldown     = false;

// Transposition: written note = concert midi + offset
let transpositionOffset = 2;  // default: Bb trumpet
function updateTransposition(val) { transpositionOffset = parseInt(val, 10) || 0; }

// Frequency history for the stability graph
const GRAPH_LEN  = 120;
let   freqHistory = [];

// Score
let scoreInTune = 0, scoreClose = 0, scoreOff = 0;

// ── TUNER STATE MACHINE ───────────────────────────────
// SILENT    : rms too low — show nothing
// SEARCHING : signal present, waiting for stable note
// LOCKED    : note confirmed — show sharp/flat

const S_SILENT    = 0;
const S_SEARCHING = 1;
const S_LOCKED    = 2;

let tunerState      = S_SILENT;
let candidateMidi   = -1;   // note we think we might be hearing
let candidateFrames = 0;    // how many consecutive frames agree
let lockedMidi      = -1;   // confirmed note
let smoothedCents   = 0;    // EMA of cents deviation
let releaseTimer    = 0;    // frames to hold after going quiet

// ── THRESHOLDS ───────────────────────────────────────
const RMS_GATE        = 0.03;   // noise floor (raised from 0.008)
const MIN_CORR        = 0.92;   // autocorrelation confidence minimum
const STABILITY_FRAMES = 10;    // frames required to lock a note (~160 ms at 60 fps)
const CANDIDATE_CENTS  = 65;    // cents tolerance to keep same candidate
const UNLOCK_CENTS     = 120;   // cents away from locked note to force re-search
const RELEASE_FRAMES   = 30;    // frames to hold locked display after going quiet
const SMOOTH_α         = 0.12;  // EMA smoothing (lower = smoother)
const THRESH_IN_TUNE   = 8;     // cents: in tune
const THRESH_CLOSE     = 25;    // cents: slightly off

// ── UI HELPERS ───────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function setOrb(state, note, status) {
  const orb = document.getElementById('pitchOrb');
  orb.className = 'pitch-orb' + (state ? ` orb-${state}` : '');
  if (note   !== undefined) document.getElementById('orbNote').textContent   = note;
  if (status !== undefined) document.getElementById('orbStatus').textContent = status;
}

function setOrbReadings(freq, cents) {
  const cEl = document.getElementById('orbCents');
  const fEl = document.getElementById('orbFreq');
  if (cEl) cEl.textContent = cents !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)} ¢` : '— ¢';
  if (fEl) fEl.textContent = freq  !== null ? `${freq.toFixed(1)} Hz` : '— Hz';
}

function setNeedle(cents) {
  const deg    = Math.max(-90, Math.min(90, cents * 1.5));
  const needle = document.getElementById('dialNeedle');
  if (needle) needle.style.transform = `rotate(${deg}deg)`;
}

function updateScoreDisplay() {
  document.getElementById('scoreCorrect').textContent = scoreInTune;
  document.getElementById('scoreClose').textContent   = scoreClose;
  document.getElementById('scoreWrong').textContent   = scoreOff;
}

// ── FREQUENCY GRAPH ───────────────────────────────────
function pushFreqGraph(freq) {
  freqHistory.push(freq);
  if (freqHistory.length > GRAPH_LEN) freqHistory.shift();
  drawFreqGraph();
}

function drawFreqGraph() {
  const canvas = document.getElementById('freqGraph');
  if (!canvas || canvas.width === 0) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const valid = freqHistory.filter(f => f > 0);
  if (valid.length < 2) return;

  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const margin = median * 0.04;
  const range  = margin * 2 || 1;
  const minF   = median - margin;

  // Centre reference line
  ctx.strokeStyle = 'rgba(59,130,246,0.25)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  ctx.setLineDash([]);

  // Frequency line
  ctx.lineWidth = 2;
  ctx.lineJoin  = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < freqHistory.length; i++) {
    const f = freqHistory[i];
    if (f <= 0) { started = false; continue; }
    const x  = (i / (GRAPH_LEN - 1)) * W;
    const cy = Math.max(1, Math.min(H - 1, H - ((f - minF) / range) * H));
    if (!started) { ctx.moveTo(x, cy); started = true; }
    else            ctx.lineTo(x, cy);
  }
  const last     = valid[valid.length - 1];
  const devCents = Math.abs(1200 * Math.log2(last / median));
  ctx.strokeStyle = devCents < 10 ? '#10b981' : devCents < 25 ? '#f5c842' : '#ef4444';
  ctx.stroke();
}

// ── MICROPHONE ───────────────────────────────────────
async function toggleMic() {
  isListening ? stopMic() : await startMic();
}

async function startMic() {
  if (location.protocol === 'file:') {
    showToast('⚠️ Open via Live Server — mic blocked on file://');
    const warn = document.getElementById('fileProtocolWarn');
    if (warn) warn.style.display = 'block';
    return;
  }
  try {
    micStream    = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 4096;
    audioCtx.createMediaStreamSource(micStream).connect(analyserNode);

    isListening   = true;
    tunerState    = S_SILENT;
    smoothedCents = 0;
    lockedMidi    = -1;
    candidateMidi = -1;
    candidateFrames = 0;

    document.getElementById('micBtn').textContent        = '⏹ Stop Listening';
    document.getElementById('micDot').classList.add('active');
    document.getElementById('micStatusText').textContent = 'Listening…';
    document.getElementById('micStatusText').style.color = '';
    setOrb('idle', '—', 'Play a note!');
    setOrbReadings(null, null);
    detectLoop();
  } catch (err) {
    const msgs = {
      NotAllowedError: '⚠️ Mic permission denied — click Allow in the browser bar.',
      NotFoundError:   '⚠️ No microphone found.',
      NotReadableError:'⚠️ Mic is in use by another app.',
    };
    showToast(msgs[err.name] || `⚠️ Mic error: ${err.message}`);
  }
}

function stopMic() {
  isListening = false;
  cancelAnimationFrame(animFrameId);
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (audioCtx)  audioCtx.close();
  micStream = null; audioCtx = null; analyserNode = null;

  document.getElementById('micBtn').textContent        = '🎙️ Start Listening';
  document.getElementById('micDot').classList.remove('active');
  document.getElementById('micStatusText').textContent = 'Microphone off';
  setOrb('idle', '—', 'Press Start');
  setNeedle(0);
  setOrbReadings(null, null);
}

// ── DETECTION LOOP ────────────────────────────────────
function detectLoop() {
  animFrameId = requestAnimationFrame(detectLoop);
  if (!analyserNode) return;

  const buffer = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(buffer);

  // ── RMS gate ──────────────────────────────────────
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  const rms = Math.sqrt(sum / buffer.length);

  if (rms < RMS_GATE) {
    if (releaseTimer > 0) {
      // Brief silence: hold the lock, decay needle gently
      releaseTimer--;
      smoothedCents *= 0.92;
      setNeedle(smoothedCents);
      return;
    }
    // True silence: reset state
    tunerState      = S_SILENT;
    candidateMidi   = -1;
    candidateFrames = 0;
    smoothedCents   = smoothedCents * 0.85;
    if (Math.abs(smoothedCents) < 0.5) smoothedCents = 0;
    setNeedle(smoothedCents);
    setOrb('idle', '—', 'Play a note!');
    setOrbReadings(null, null);
    pushFreqGraph(0);
    return;
  }

  // Signal present — reset release timer
  releaseTimer = RELEASE_FRAMES;

  // ── Pitch detection ───────────────────────────────
  const freq = autoCorrelate(buffer, audioCtx.sampleRate);
  if (freq === -1) return;  // low confidence — skip frame

  const detectedMidi = freqToMidi(freq);
  const closestFreq  = noteFrequency(detectedMidi);
  const rawCents     = 1200 * Math.log2(freq / closestFreq);

  // ── SEARCHING: accumulate stable frames ───────────
  if (tunerState !== S_LOCKED) {
    tunerState = S_SEARCHING;

    if (candidateMidi === -1) {
      candidateMidi   = detectedMidi;
      candidateFrames = 1;
    } else {
      const centsFromCandidate = Math.abs(1200 * Math.log2(freq / noteFrequency(candidateMidi)));
      if (centsFromCandidate < CANDIDATE_CENTS) {
        candidateFrames++;
        if (candidateFrames >= STABILITY_FRAMES) {
          // ── NOTE LOCKED ──────────────────────────
          lockedMidi    = detectedMidi;
          tunerState    = S_LOCKED;
          smoothedCents = rawCents;
        }
      } else {
        // Different note — restart candidate
        candidateMidi   = detectedMidi;
        candidateFrames = 1;
      }
    }

    // Show search progress in orb
    const pct = Math.round((candidateFrames / STABILITY_FRAMES) * 100);
    setOrb('idle', candidateMidi >= 0 ? midiToName(candidateMidi + transpositionOffset) : '—',
           `Detecting… ${pct}%`);
    pushFreqGraph(freq);
    return;
  }

  // ── LOCKED: measure how sharp/flat ───────────────
  const centsFromLocked = 1200 * Math.log2(freq / noteFrequency(lockedMidi));

  if (Math.abs(centsFromLocked) > UNLOCK_CENTS) {
    // Pitch moved far away — go back to searching
    tunerState      = S_SEARCHING;
    candidateMidi   = detectedMidi;
    candidateFrames = 1;
    return;
  }

  // EMA smooth the cents reading
  smoothedCents = smoothedCents * (1 - SMOOTH_α) + centsFromLocked * SMOOTH_α;

  setNeedle(smoothedCents);
  setOrbReadings(freq, smoothedCents);
  pushFreqGraph(freq);

  const name = midiToName(lockedMidi + transpositionOffset);
  const abs  = Math.abs(smoothedCents);

  if (abs <= THRESH_IN_TUNE) {
    setOrb('correct', name, '✅ In Tune');
    if (!cooldown) { scoreInTune++; updateScoreDisplay(); triggerCooldown(1200); }
  } else if (abs <= THRESH_CLOSE) {
    setOrb('close', name, smoothedCents > 0 ? '▲ Slightly Sharp' : '▼ Slightly Flat');
  } else {
    setOrb('wrong', name, smoothedCents > 0 ? '▲ Sharp' : '▼ Flat');
  }
}

// ── AUTOCORRELATION ───────────────────────────────────
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < RMS_GATE) return -1;

  let bestOffset = -1, bestCorr = 0, lastCorr = 1;
  let foundGood  = false;
  const corrs    = new Float32Array(SIZE);

  for (let offset = 0; offset < SIZE / 2; offset++) {
    let corr = 0;
    for (let i = 0; i < SIZE / 2; i++) corr += Math.abs(buf[i] - buf[i + offset]);
    corr = 1 - corr / (SIZE / 2);
    corrs[offset] = corr;

    if (corr > MIN_CORR && corr > lastCorr) {
      foundGood = true;
      if (corr > bestCorr) { bestCorr = corr; bestOffset = offset; }
    } else if (foundGood) {
      const prev  = corrs[bestOffset - 1] ?? 0;
      const next  = corrs[bestOffset + 1] ?? 0;
      const denom = 2 * (2 * corrs[bestOffset] - prev - next);
      const shift = denom !== 0 ? (next - prev) / denom : 0;
      return sampleRate / (bestOffset + shift);
    }
    lastCorr = corr;
  }
  if (bestCorr > MIN_CORR) return sampleRate / bestOffset;
  return -1;
}

// ── HELPERS ──────────────────────────────────────────
function triggerCooldown(ms) {
  cooldown = true;
  setTimeout(() => { cooldown = false; }, ms);
}

function resetScore() {
  scoreInTune = scoreClose = scoreOff = 0;
  updateScoreDisplay();
  showToast('Score reset!');
}

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('freqGraph');
  if (canvas) {
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.round(rect.width)  || 90;
      canvas.height = Math.round(rect.height) || 260;
    });
  }
  const sel = document.getElementById('transpositionSelect');
  if (sel) updateTransposition(sel.value);
  setNeedle(0);
});
