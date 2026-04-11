/* ====================================================
   pitch.js — Real-Time Pitch Detector
   Uses Web Audio API + Autocorrelation algorithm
   No external libraries or API keys required.
==================================================== */

// ============================================================
// MUSIC THEORY DATA
// ============================================================

// All 12 chromatic note names (concert pitch)
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Frequency of every note from C2 to C6 (concert pitch)
// Generated from A4 = 440 Hz standard tuning
function noteFrequency(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Build a lookup table: midi number → { name, octave, freq }
const NOTE_TABLE = [];
for (let midi = 36; midi <= 84; midi++) {
  const name   = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  NOTE_TABLE.push({ midi, name, octave, fullName: `${name}${octave}`, freq: noteFrequency(midi) });
}

// Playable written notes for each instrument (what the player sees on their part)
// We'll store them as written note names and convert to concert pitch using transposition offset
const WRITTEN_NOTES = [
  'C4','D4','E4','F4','G4','A4','B4',
  'C5','D5','E5','F5','G5','A5',
  'Bb3','Bb4',
  'F4','F5',
];

// Deduped, sorted list of written notes to show in dropdown
const DROPDOWN_NOTES = [
  { label: 'Low C  (C4)',  written: 'C4'  },
  { label: 'D  (D4)',      written: 'D4'  },
  { label: 'E  (E4)',      written: 'E4'  },
  { label: 'F  (F4)',      written: 'F4'  },
  { label: 'G  (G4)',      written: 'G4'  },
  { label: 'A  (A4)',      written: 'A4'  },
  { label: 'Bb (Bb4)',     written: 'Bb4' },
  { label: 'B  (B4)',      written: 'B4'  },
  { label: 'High C (C5)', written: 'C5'  },
  { label: 'D  (D5)',      written: 'D5'  },
  { label: 'E  (E5)',      written: 'E5'  },
  { label: 'F  (F5)',      written: 'F5'  },
  { label: 'G  (G5)',      written: 'G5'  },
];

// Map shorthand written note names to MIDI numbers
const WRITTEN_TO_MIDI = {
  'C4':60,'D4':62,'E4':64,'F4':65,'G4':67,'A4':69,'Bb4':70,'B4':71,
  'C5':72,'D5':74,'E5':76,'F5':77,'G5':79,'A5':81,'Bb3':58,'F3':53,
};

// ============================================================
// STATE
// ============================================================
let audioCtx       = null;
let analyserNode   = null;
let micStream      = null;
let animFrameId    = null;
let isListening    = false;
let cooldown       = false;  // blocks repeated triggers on sustained notes

let transpositionSemitones = -2;  // default: Trumpet in Bb
let targetMidi             = 72;  // default: High C (concert Bb for trumpet)
let targetFreq             = noteFrequency(targetMidi);

let scoreCorrect = 0;
let scoreClose   = 0;
let scoreWrong   = 0;

// Tolerances in cents (100 cents = 1 semitone)
const CENTS_PERFECT = 20;   // within 20 cents = correct
const CENTS_CLOSE   = 50;   // within 50 cents = close
// More than 50 cents = wrong note / wrong partial

// ============================================================
// UI HELPERS
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function setOrb(state, noteLabel, statusLabel) {
  const orb    = document.getElementById('pitchOrb');
  const note   = document.getElementById('orbNote');
  const status = document.getElementById('orbStatus');
  orb.className = 'pitch-orb';
  if (state) orb.classList.add(`orb-${state}`);
  note.textContent   = noteLabel  ?? note.textContent;
  status.textContent = statusLabel ?? status.textContent;
}

function setNeedle(cents) {
  // cents: -50 to +50 maps to 0%–100% needle position
  const pct = Math.min(100, Math.max(0, ((cents + 60) / 120) * 100));
  document.getElementById('tuningNeedle').style.left = `${pct}%`;
}

function updateLiveReadings(detectedNote, freq, cents) {
  document.getElementById('liveNote').textContent  = detectedNote || '—';
  document.getElementById('liveFreq').textContent  = freq   ? `${freq.toFixed(1)} Hz` : '—';
  document.getElementById('liveCents').textContent = cents  !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)}¢` : '—';
}

function updateScoreDisplay() {
  document.getElementById('scoreCorrect').textContent = scoreCorrect;
  document.getElementById('scoreClose').textContent   = scoreClose;
  document.getElementById('scoreWrong').textContent   = scoreWrong;
}

// ============================================================
// POPULATE NOTE DROPDOWN
// ============================================================
function populateNoteDropdown() {
  const sel = document.getElementById('targetNoteSelect');
  sel.innerHTML = '';
  DROPDOWN_NOTES.forEach(n => {
    const opt = document.createElement('option');
    opt.value       = n.written;
    opt.textContent = n.label;
    sel.appendChild(opt);
  });
  // default to High C
  sel.value = 'C5';
  updateTargetNote();
}

function updateTransposition() {
  transpositionSemitones = parseInt(document.getElementById('instrumentSelect').value, 10);
  updateTargetNote();
}

function updateTargetNote() {
  const written = document.getElementById('targetNoteSelect').value;
  const writtenMidi = WRITTEN_TO_MIDI[written];
  if (!writtenMidi) return;

  // Concert pitch = written pitch + transpositionSemitones
  targetMidi = writtenMidi + transpositionSemitones;
  targetFreq = noteFrequency(targetMidi);

  // Show the concert pitch label
  const concertName = midiToName(targetMidi);
  const concertLabel = document.getElementById('concertLabel');
  if (transpositionSemitones !== 0) {
    concertLabel.textContent = `= ${concertName} concert`;
    concertLabel.style.display = 'inline';
  } else {
    concertLabel.style.display = 'none';
  }

  document.getElementById('liveTarget').textContent = `${concertName} (${targetFreq.toFixed(1)} Hz)`;
  setOrb('idle', written, isListening ? 'Play it!' : 'Press Start');
}

function midiToName(midi) {
  return NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1);
}

// ============================================================
// MICROPHONE  — START / STOP
// ============================================================
async function toggleMic() {
  if (isListening) {
    stopMic();
  } else {
    await startMic();
  }
}

async function startMic() {
  // Microphone requires a secure context (localhost or https).
  // It is blocked on file:// URLs by all modern browsers.
  if (location.protocol === 'file:') {
    showToast('⚠️ Open via Live Server — mic blocked on file://');
    document.getElementById('micStatusText').textContent = 'Blocked on file:// — use Live Server';
    document.getElementById('micStatusText').style.color = 'var(--danger)';
    // Show a more prominent in-page warning
    const warn = document.getElementById('fileProtocolWarn');
    if (warn) warn.style.display = 'block';
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;

    const source = audioCtx.createMediaStreamSource(micStream);
    source.connect(analyserNode);

    isListening = true;
    document.getElementById('micBtn').textContent        = '⏹ Stop Listening';
    document.getElementById('micDot').classList.add('active');
    document.getElementById('micStatusText').textContent = 'Listening…';
    document.getElementById('micStatusText').style.color = '';
    setOrb('idle', document.getElementById('targetNoteSelect').value, 'Play it!');

    detectLoop();
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showToast('⚠️ Mic permission denied — click Allow in the browser bar.');
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      showToast('⚠️ No microphone found — check Windows Privacy → Microphone settings.');
      document.getElementById('micStatusText').textContent = 'No mic device found';
      document.getElementById('micStatusText').style.color = 'var(--danger)';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      showToast('⚠️ Mic is in use by another app (Zoom/Teams/Discord?) — close it and try again.');
      document.getElementById('micStatusText').textContent = 'Mic in use by another app';
      document.getElementById('micStatusText').style.color = 'var(--danger)';
    } else {
      showToast('⚠️ Could not access microphone: ' + err.message);
    }
    console.error('Mic error:', err.name, err.message);
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
  updateLiveReadings(null, null, null);
}

// ============================================================
// PITCH DETECTION LOOP  (Auto-Correlation)
// ============================================================
function detectLoop() {
  animFrameId = requestAnimationFrame(detectLoop);

  if (!analyserNode || cooldown) return;

  const bufferLength = analyserNode.fftSize;
  const buffer       = new Float32Array(bufferLength);
  analyserNode.getFloatTimeDomainData(buffer);

  // RMS — check if signal is loud enough to bother analysing
  const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / bufferLength);
  if (rms < 0.01) {
    setOrb('idle', document.getElementById('targetNoteSelect').value, 'Waiting…');
    setNeedle(0);
    updateLiveReadings(null, null, null);
    return;
  }

  const freq = autoCorrelate(buffer, audioCtx.sampleRate);
  if (freq === -1) return; // not enough confidence

  const detectedMidi = freqToMidi(freq);
  const detectedName = midiToName(detectedMidi);

  // Cents deviation from target
  const cents = 1200 * Math.log2(freq / targetFreq);

  updateLiveReadings(detectedName, freq, cents);
  setNeedle(cents);

  if (Math.abs(cents) <= CENTS_PERFECT) {
    handleCorrect(detectedName);
  } else if (Math.abs(cents) <= CENTS_CLOSE) {
    handleClose(detectedName, cents);
  } else {
    handleWrong(detectedName);
  }
}

// ============================================================
// AUTO-CORRELATION  (Yin-inspired, no external library)
// ============================================================
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let bestOffset = -1;
  let bestCorrelation = 0;
  let rms = 0;
  let foundGoodCorrelation = false;
  let correlations = new Array(SIZE);

  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;  // too quiet

  let lastCorrelation = 1;
  for (let offset = 0; offset < SIZE / 2; offset++) {
    let correlation = 0;
    for (let i = 0; i < SIZE / 2; i++) {
      correlation += Math.abs((buf[i]) - (buf[i + offset]));
    }
    correlation = 1 - (correlation / (SIZE / 2));
    correlations[offset] = correlation;

    if ((correlation > 0.9) && (correlation > lastCorrelation)) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      // parabolic interpolation for precision
      const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) /
                    (2 * (2 * correlations[bestOffset] - correlations[bestOffset - 1] - correlations[bestOffset + 1]));
      return sampleRate / (bestOffset + shift);
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01) return sampleRate / bestOffset;
  return -1;
}

function freqToMidi(freq) {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

// ============================================================
// FEEDBACK HANDLERS
// ============================================================
function handleCorrect(name) {
  scoreCorrect++;
  updateScoreDisplay();
  setOrb('correct', name, '✅ Correct!');
  playDing();
  triggerCooldown(1800);
}

function handleClose(name, cents) {
  setOrb('close', name, cents > 0 ? '🎯 Sharp — relax' : '🎯 Flat — push');
  // No score bump, no cooldown — encourage them to bend the pitch
}

function handleWrong(name) {
  scoreWrong++;
  updateScoreDisplay();
  setOrb('wrong', name, '❌ Wrong partial');
  playBang();
  triggerCooldown(600);
}

function triggerCooldown(ms) {
  cooldown = true;
  setTimeout(() => {
    cooldown = false;
    setOrb('idle', document.getElementById('targetNoteSelect').value, 'Play it!');
  }, ms);
}

// ============================================================
// SYNTHESIZED AUDIO FEEDBACK  (Web Audio API)
// ============================================================
function getFeedbackAudioCtx() {
  // Use a small throwaway AudioContext for feedback sounds
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playDing() {
  const ctx  = getFeedbackAudioCtx();
  // High warm bell tone
  [880, 1320, 1760].forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25 / (i + 1), ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.2);
  });
  setTimeout(() => ctx.close(), 1400);
}

function playBang() {
  const ctx  = getFeedbackAudioCtx();
  // Deep dissonant thump
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  const dist = ctx.createWaveShaper();
  dist.curve = makeDistortionCurve(300);
  osc.connect(dist);
  dist.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.55, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.36);
  setTimeout(() => ctx.close(), 500);
}

function makeDistortionCurve(amount) {
  const n = 256, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// ============================================================
// SCORE
// ============================================================
function resetScore() {
  scoreCorrect = scoreClose = scoreWrong = 0;
  updateScoreDisplay();
  showToast('Score reset!');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  populateNoteDropdown();
  updateTransposition();
});
