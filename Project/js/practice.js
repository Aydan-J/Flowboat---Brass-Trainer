/* ====================================================
   practice.js — Timer, Metronome, Exercise Library
==================================================== */

// ---- Sight Reading Data ----
const SR_NOTES = {
  treble: ["G3", "A3", "Bb3", "B3", "C4", "C#4", "D4", "Eb4", "E4", "F4", "F#4", "G4", "Ab4", "A4", "Bb4", "B4", "C5", "D5", "E5", "F5", "G5"],
  bass: ["E2", "F2", "F#2", "G2", "Ab2", "A2", "Bb2", "B2", "C3", "C#3", "D3", "Eb3", "E3", "F3", "F#3", "G3", "Ab3", "A3", "Bb3", "C4", "D4", "Eb4", "F4"]
};

// ---- localStorage helpers ----
function getSessions() {
  return JSON.parse(localStorage.getItem('bt_sessions') || '[]');
}
function saveSessions(arr) {
  localStorage.setItem('bt_sessions', JSON.stringify(arr));
}

// ---- Toast ----
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
// TIMER
// ============================================================
let timerSeconds  = 0;
let timerRunning  = false;
let timerInterval = null;

function updateTimerDisplay() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const s = String(timerSeconds % 60).padStart(2, '0');
  document.getElementById('timerDisplay').textContent = `${m}:${s}`;
}

function timerToggle() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('timerStartBtn').textContent = '▶ Resume';
  } else {
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
    timerRunning = true;
    document.getElementById('timerStartBtn').textContent = '⏸ Pause';
  }
}

function timerReset() {
  clearInterval(timerInterval);
  timerRunning  = false;
  timerSeconds  = 0;
  updateTimerDisplay();
  document.getElementById('timerStartBtn').textContent = '▶ Start';
}

// ============================================================
// METRONOME  (Web Audio API)
// ============================================================
let bpm          = 100;
let metroRunning = false;
let metroTimeout = null;
let beatIndex    = 0;
let audioCtx     = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playClick(isAccent) {
  const ctx  = getAudioCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = isAccent ? 1200 : 900;
  gain.gain.setValueAtTime(isAccent ? 0.5 : 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.07);
}

function flashBeat() {
  const dots = document.querySelectorAll('.beat-dot');
  dots.forEach(d => d.classList.remove('active'));
  if (dots[beatIndex]) dots[beatIndex].classList.add('active');
  beatIndex = (beatIndex + 1) % dots.length;
}

function scheduleTick() {
  if (!metroRunning) return;
  playClick(beatIndex === 0);
  flashBeat();
  const interval = (60 / bpm) * 1000;
  metroTimeout = setTimeout(scheduleTick, interval);
}

function metronomeToggle() {
  if (metroRunning) {
    metronomeStop();
  } else {
    metroRunning = true;
    beatIndex    = 0;
    document.getElementById('metroStartBtn').textContent = '⏸ Pause';
    scheduleTick();
  }
}

function metronomeStop() {
  metroRunning = false;
  clearTimeout(metroTimeout);
  document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active'));
  document.getElementById('metroStartBtn').textContent = '▶ Start';
}

function bpmChange(val) {
  bpm = parseInt(val, 10);
  document.getElementById('bpmDisplay').textContent = bpm;
  updateSliderTrack(val);
  // update active preset highlight
  document.querySelectorAll('.bpm-preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.bpm) === bpm);
  });
  if (metroRunning) {
    clearTimeout(metroTimeout);
    scheduleTick();
  }
}

function setPreset(val, el) {
  bpm = val;
  document.getElementById('bpmSlider').value = val;
  document.getElementById('bpmDisplay').textContent = val;
  updateSliderTrack(val);
  document.querySelectorAll('.bpm-preset-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  if (metroRunning) {
    clearTimeout(metroTimeout);
    scheduleTick();
  }
}

function updateSliderTrack(val) {
  const slider = document.getElementById('bpmSlider');
  const min = slider.min, max = slider.max;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--slider-pct', `${pct}%`);
}

// ============================================================
// SIGHT READING PRACTICE
// ============================================================
let currentTargetNote = "";
let isWaiting = false;

function playSound(type) {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  if (type === 'ding') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } else {
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }
}

function renderSRStaff(noteStr, clef) {
  const VF = Vex.Flow;
  const staffDisplay = document.getElementById('srStaffDisplay');
  staffDisplay.innerHTML = "";
  
  const renderer = new VF.Renderer(staffDisplay, VF.Renderer.Backends.SVG);
  renderer.resize(140, 150);
  const context = renderer.getContext();
  
  const stave = new VF.Stave(10, 20, 120);
  stave.addClef(clef).setContext(context).draw();
  
  const match = noteStr.match(/^([A-Ga-g])([b#]?)([0-9])$/);
  if (!match) return;
  const vfNote = `${match[1].toLowerCase()}${match[2]}/${match[3]}`;
  
  const note = new VF.StaveNote({ keys: [vfNote], duration: "q", clef: clef });
  if (match[2]) {
    note.addAccidental(0, new VF.Accidental(match[2]));
  }
  
  const voice = new VF.Voice({ num_beats: 1, beat_value: 4 });
  voice.addTickables([note]);
  
  const formatter = new VF.Formatter().joinVoices([voice]).format([voice], 80);
  voice.draw(context, stave);
}

function nextSightReadingNote() {
  if (isWaiting) return;
  const clef = document.getElementById('srClef').value;
  const pool = SR_NOTES[clef];
  
  let newNote;
  do {
    newNote = pool[Math.floor(Math.random() * pool.length)];
  } while (newNote === currentTargetNote && pool.length > 1);
  
  currentTargetNote = newNote;
  renderSRStaff(currentTargetNote, clef);
  
  // Generate options
  const options = new Set();
  options.add(currentTargetNote);
  while(options.size < 4) {
    options.add(pool[Math.floor(Math.random() * pool.length)]);
  }
  
  const shuffled = Array.from(options).sort(() => Math.random() - 0.5);
  const container = document.getElementById('srMultipleChoice');
  container.innerHTML = '';
  
  shuffled.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.width = '80px';
    btn.innerText = opt;
    btn.onclick = () => checkSightReadingAnswer(opt, btn);
    container.appendChild(btn);
  });
  
  const statusMsg = document.getElementById('srStatusMsg');
  statusMsg.innerText = "Identify the note above!";
  statusMsg.style.color = "var(--text-muted)";
  
  const srContainer = document.getElementById('srContainer');
  srContainer.style.boxShadow = "none";
  srContainer.style.borderColor = "var(--border)";
}

function checkSightReadingAnswer(selectedNote, btn) {
  if (isWaiting) return;
  isWaiting = true;
  
  const statusMsg = document.getElementById('srStatusMsg');
  const srContainer = document.getElementById('srContainer');
  
  const buttons = document.getElementById('srMultipleChoice').children;
  for(let b of buttons) {
    b.disabled = true;
    if (b.innerText === currentTargetNote) {
      b.className = 'btn btn-primary'; // Highlight correct answer
    }
  }
  
  if (selectedNote === currentTargetNote) {
    playSound('ding');
    statusMsg.innerText = "✅ Correct!";
    statusMsg.style.color = "var(--success)";
    srContainer.style.borderColor = "var(--success)";
    srContainer.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.2)";
    setTimeout(() => {
      isWaiting = false;
      nextSightReadingNote();
    }, 1000);
  } else {
    playSound('buzzer');
    btn.className = 'btn'; 
    btn.style.backgroundColor = "#ef4444";
    btn.style.color = "white";
    
    statusMsg.innerText = `❌ Incorrect. That is a ${currentTargetNote}!`;
    statusMsg.style.color = "#ef4444";
    srContainer.style.borderColor = "#ef4444";
    srContainer.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.2)";
    
    setTimeout(() => {
      isWaiting = false;
      nextSightReadingNote();
    }, 2500);
  }
}

// ============================================================
// SAVE SESSION
// ============================================================
function logSession() {
  if (timerSeconds < 5) {
    showToast('⚠️ Practice at least 5 seconds before saving!');
    return;
  }
  const sessions = getSessions();
  sessions.unshift({
    date:     new Date().toISOString(),
    exercise: 'Sight Reading Practice',
    seconds:  timerSeconds,
  });
  saveSessions(sessions);
  showToast(`✅ Session saved — ${formatDur(timerSeconds)} of Sight Reading Practice`);
  timerReset();
}

function formatDur(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  updateSliderTrack(100);
  if (typeof Vex !== 'undefined') {
    nextSightReadingNote();
  } else {
    // If vexflow loads a bit late
    setTimeout(nextSightReadingNote, 200);
  }
});
