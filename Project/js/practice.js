/* ====================================================
   practice.js — Timer, Metronome, Exercise Library
==================================================== */

// ---- Shared exercise data ----
const EXERCISES = [
  { id: 'long-tones',     name: 'Long Tones',            icon: '🎵', level: 'Beginner',     meta: '4 beats per note · Full breath support' },
  { id: 'lip-slurs',      name: 'Lip Slurs',             icon: '🌊', level: 'Intermediate', meta: 'Smooth register changes · No tongue' },
  { id: 'major-scales',   name: 'Major Scales',          icon: '🎼', level: 'Beginner',     meta: 'All 12 keys · Quarter notes' },
  { id: 'chromatic',      name: 'Chromatic Scale',       icon: '🔢', level: 'Intermediate', meta: 'Full range · Even articulation' },
  { id: 'articulation',   name: 'Articulation Patterns', icon: '👅', level: 'Intermediate', meta: 'Single/double/triple tongue' },
  { id: 'flex',           name: 'Flexibility Studies',   icon: '⚡', level: 'Advanced',     meta: 'Fast register leaps · Relaxed embouchure' },
  { id: 'sight-reading',  name: 'Sight Reading',         icon: '👁️', level: 'Advanced',     meta: 'New passage daily · No repeat preview' },
  { id: 'hymns',          name: 'Lyrical Hymns',         icon: '🎶', level: 'Beginner',     meta: 'Expressive phrasing · Breath control' },
];

window.EXERCISES = EXERCISES; // expose for other scripts

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
// EXERCISE LIST
// ============================================================
let selectedExerciseId = null;

function renderExercises() {
  const list = document.getElementById('exerciseList');
  list.innerHTML = '';
  EXERCISES.forEach(ex => {
    const lvl = ex.level.toLowerCase();
    const item = document.createElement('div');
    item.className = 'exercise-item';
    item.id = `ex-${ex.id}`;
    item.innerHTML = `
      <div class="ex-icon">${ex.icon}</div>
      <div class="ex-info">
        <div class="ex-name">${ex.name}</div>
        <div class="ex-meta">${ex.meta}</div>
      </div>
      <span class="ex-badge badge-${lvl}">${ex.level}</span>
    `;
    item.addEventListener('click', () => selectExercise(ex));
    list.appendChild(item);
  });
}

function selectExercise(ex) {
  selectedExerciseId = ex.id;
  document.querySelectorAll('.exercise-item').forEach(el => el.classList.remove('selected'));
  document.getElementById(`ex-${ex.id}`).classList.add('selected');
  document.getElementById('selectedName').textContent = ex.name;
  document.getElementById('selectedExercise').style.display = 'block';
}

// ============================================================
// SAVE SESSION
// ============================================================
function logSession() {
  if (timerSeconds < 5) {
    showToast('⚠️ Practice at least 5 seconds before saving!');
    return;
  }
  const ex = selectedExerciseId
    ? EXERCISES.find(e => e.id === selectedExerciseId)?.name
    : 'General Practice';
  const sessions = getSessions();
  sessions.unshift({
    date:     new Date().toISOString(),
    exercise: ex,
    seconds:  timerSeconds,
  });
  saveSessions(sessions);
  showToast(`✅ Session saved — ${formatDur(timerSeconds)} of "${ex}"`);
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
  renderExercises();
  updateSliderTrack(100);
});
