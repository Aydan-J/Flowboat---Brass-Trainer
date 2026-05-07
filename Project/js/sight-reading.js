// js/sight-reading.js

const FINGERINGS = {
  trumpet: {
    "F#3": ["123"], "G3": ["13"], "G#3": ["23"], "A3": ["12"], "Bb3": ["1"], "B3": ["2"],
    "C4": ["0"], "C#4": ["123"], "D4": ["13"], "Eb4": ["23"], "E4": ["12"], "F4": ["1"], "F#4": ["2"],
    "G4": ["0"], "G#4": ["23"], "A4": ["12"], "Bb4": ["1"], "B4": ["2"],
    "C5": ["0"], "C#5": ["12"], "D5": ["1"], "Eb5": ["2"], "E5": ["0"], "F5": ["1"], "F#5": ["2"], "G5": ["0"]
  }
};

const KEY_ACCIDENTALS = {
  'C': {}, 'G': { 'F': '#' }, 'D': { 'F': '#', 'C': '#' }, 'A': { 'F': '#', 'C': '#', 'G': '#' },
  'E': { 'F': '#', 'C': '#', 'G': '#', 'D': '#' }, 'B': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#' },
  'F': { 'B': 'b' }, 'Bb': { 'B': 'b', 'E': 'b' }, 'Eb': { 'B': 'b', 'E': 'b', 'A': 'b' },
  'Ab': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b' }, 'Db': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b' }
};

// --- State ---
let bpm = 80;
let keySignature = 'C';
let includeRests = false;
let includeAccidentals = false;
let allowedDurations = ['q'];
let noteRange = [];

let score = 0;
let combo = 0;
let isPlaying = false;
let isPaused = false;
let notesOnStaff = [];
let activeValves = { 1: false, 2: false, 3: false };

let startTime = 0;
let audioStartTime = 0;
let animationId = null;
let audioCtx = null;

let metronomeEnabled = true;
let countInEnabled = true;
let lastBeatPlayed = -1;
let countInActive = false;
let trackBaseX = 100; // The X of the very first note

const PIXELS_PER_BEAT = 100;
const BEATS_PER_MEASURE = 4;
const PIXELS_PER_MEASURE = PIXELS_PER_BEAT * BEATS_PER_MEASURE;
const EVAL_TOLERANCE = 25;

let currentNoteOsc = null;
let currentNoteGain = null;

document.addEventListener('DOMContentLoaded', () => {
  const startGameBtn = document.getElementById('startGameBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartGameBtn = document.getElementById('restartGameBtn');
  const restartFromPauseBtn = document.getElementById('restartFromPauseBtn');
  const quitBtn = document.getElementById('quitBtn');
  const restartBtnResults = document.getElementById('restartBtn');

  if (startGameBtn) startGameBtn.addEventListener('click', startGame);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseGame);
  if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
  if (restartGameBtn) restartGameBtn.addEventListener('click', startGame);
  if (restartFromPauseBtn) restartFromPauseBtn.addEventListener('click', startGame);
  if (quitBtn) quitBtn.addEventListener('click', () => location.reload());
  
  if (restartBtnResults) {
    restartBtnResults.addEventListener('click', () => {
      document.getElementById('resultsOverlay').style.display = 'none';
      document.getElementById('gameOverlay').style.display = 'flex';
    });
  }
});

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

async function startGame() {
  const ctx = initAudio();
  try {
    bpm = parseInt(document.getElementById('bpmInput').value) || 80;
    keySignature = document.getElementById('keySigSelect').value;
    includeRests = document.getElementById('restCheck').checked;
    includeAccidentals = document.getElementById('accidentalCheck').checked;
    metronomeEnabled = document.getElementById('metronomeCheck').checked;
    countInEnabled = document.getElementById('countInCheck').checked;
    
    allowedDurations = [];
    document.querySelectorAll('.dur-check:checked').forEach(cb => allowedDurations.push(cb.value));
    if (allowedDurations.length === 0) allowedDurations = ['q'];

    const allNotes = Object.keys(FINGERINGS.trumpet);
    const lowIdx = allNotes.indexOf(document.getElementById('lowLimitSelect').value);
    const highIdx = allNotes.indexOf(document.getElementById('highLimitSelect').value);
    noteRange = allNotes.slice(lowIdx, highIdx + 1);

    document.getElementById('currentBpmDisplay').innerText = `${bpm} BPM`;
    score = 0; combo = 0; updateStats();
    notesOnStaff = [];
    document.getElementById('staffContainer').innerHTML = '';
    
    generateTrack();
    
    // Set base X from first note
    trackBaseX = notesOnStaff.length > 0 ? notesOnStaff[0].x : 100;

    document.getElementById('gameOverlay').style.display = 'none';
    document.getElementById('pauseOverlay').style.display = 'none';
    document.getElementById('resultsOverlay').style.display = 'none';
    document.getElementById('gameControls').style.display = 'flex';
    
    const sweepLine = document.getElementById('sweepLine');
    sweepLine.style.display = 'block';
    sweepLine.style.left = `${trackBaseX}px`; 
    
    document.getElementById('scrollingTrack').scrollLeft = 0;
    
    isPlaying = true; isPaused = false; countInActive = true; lastBeatPlayed = -1;
    if (countInEnabled) await performCountIn();
    
    countInActive = false;
    audioStartTime = ctx.currentTime;
    startTime = performance.now();
    
    if (animationId) cancelAnimationFrame(animationId);
    requestAnimationFrame(gameLoop);
  } catch (e) {
    console.error("Sight reading failed to start:", e);
  }
}

function performCountIn() {
  return new Promise(resolve => {
    const beatMs = (60 / bpm) * 1000;
    let beats = 0;
    const interval = setInterval(() => {
      playMetronomeTick(beats === 0);
      beats++;
      if (beats >= 4) { clearInterval(interval); setTimeout(resolve, beatMs); }
    }, beatMs);
  });
}

function playMetronomeTick(isStrong) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = isStrong ? 1200 : 800;
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 0.1);
}

function pauseGame() {
  if (!isPlaying || isPaused) return;
  isPaused = true; stopNoteSound();
  document.getElementById('pauseOverlay').style.display = 'flex';
  cancelAnimationFrame(animationId);
}

function resumeGame() {
  if (!isPaused) return;
  isPaused = false;
  document.getElementById('pauseOverlay').style.display = 'none';
  const currentPos = (parseFloat(document.getElementById('sweepLine').style.left) - trackBaseX) / PIXELS_PER_BEAT;
  audioStartTime = audioCtx.currentTime - (currentPos * (60/bpm));
  requestAnimationFrame(gameLoop);
}

function updateStats() {
  document.getElementById('scoreVal').innerText = score;
  document.getElementById('comboVal').innerText = combo;
}

function generateTrack() {
  const VF = Vex.Flow;
  const numMeasures = 12;
  const totalWidth = numMeasures * PIXELS_PER_MEASURE + 800;
  const container = document.getElementById('staffContainer');
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, 300);
  const context = renderer.getContext();
  
  let xOffset = 100;
  const DUR_VALS = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5 };
  let filteredRange = includeAccidentals ? noteRange : noteRange.filter(n => !n.includes('#') && !n.includes('b'));
  if (filteredRange.length === 0) filteredRange = noteRange; 

  for (let m = 0; m < numMeasures; m++) {
    const stave = new VF.Stave(xOffset, 40, PIXELS_PER_MEASURE);
    if (m === 0) stave.addClef('treble').addTimeSignature('4/4').addKeySignature(keySignature);
    if (m === numMeasures - 1) stave.setEndBarType(VF.Barline.type.END);
    stave.setContext(context).draw();
    
    const vfNotes = [];
    const measureData = [];
    let curB = 0;
    while (curB < 4) {
      let dur = allowedDurations[Math.floor(Math.random() * allowedDurations.length)];
      if (curB + DUR_VALS[dur] > 4) {
        if (curB + 1 <= 4) dur = 'q';
        else if (curB + 0.5 <= 4) dur = '8';
        else break;
      }
      const isRest = includeRests && Math.random() < 0.15;
      const noteName = filteredRange[Math.floor(Math.random() * filteredRange.length)];
      const match = noteName.match(/^([A-G])([b#]?)([0-9])$/);
      const vfKey = `${match[1].toLowerCase()}/${match[3]}`;
      const note = new VF.StaveNote({ keys: [vfKey], duration: isRest ? dur + "r" : dur });
      if (!isRest) {
        const keyAcc = KEY_ACCIDENTALS[keySignature][match[1].toUpperCase()] || 'none';
        if (match[2] && match[2] !== keyAcc) note.addAccidental(0, new VF.Accidental(match[2]));
      }
      const nid = `note-${notesOnStaff.length + vfNotes.length}`;
      vfNotes.push(note);
      measureData.push({ id: nid, dur, isRest, pitch: vfKey, acc: match[2] || 'none', fingering: FINGERINGS.trumpet[noteName][0] });
      curB += DUR_VALS[dur];
    }
    
    const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(vfNotes);
    new VF.Formatter().joinVoices([voice]).format([voice], PIXELS_PER_MEASURE - (m === 0 ? 100 : 20));
    
    let subB = 0;
    vfNotes.forEach((note, i) => {
      const d = measureData[i];
      // FORCE LINEAR SPACING
      if (note.getTickContext()) {
          // In VexFlow 3.x, TickContext X is relative to the internal formatting origin.
          // For measure 0, the clef/time signature push the origin forward.
          // We'll set the X and then capture the absolute rendered X.
          note.getTickContext().setX(subB * PIXELS_PER_BEAT);
      }
      note.setStave(stave).setContext(context);
      
      if (!d.isRest) {
        context.openGroup(d.id, "vf-note-group");
        note.draw();
        context.closeGroup();
        
        // Capture ACTUAL absolute X after drawing
        const actualX = note.getAbsoluteX();
        notesOnStaff.push({
          id: d.id,
          x: actualX,
          durationPixels: DUR_VALS[d.dur] * PIXELS_PER_BEAT,
          fingering: d.fingering,
          hit: false, processed: false, active: false, soundTriggered: false,
          pitchStr: d.pitch, accidental: d.acc
        });
        createHoldVisual(d.id);
      } else {
        note.draw();
      }
      subB += DUR_VALS[d.dur];
    });
    xOffset += PIXELS_PER_MEASURE;
  }
}

function createHoldVisual(noteId) {
  const el = document.getElementById(noteId);
  if (!el) return;
  const paths = el.querySelectorAll('path');
  if (paths.length === 0) return;
  const noteHead = paths[0];
  const bbox = noteHead.getBBox();
  const ns = "http://www.w3.org/2000/svg";
  const circle = document.createElementNS(ns, "circle");
  const r = 24;
  circle.setAttribute("cx", bbox.x + bbox.width / 2);
  circle.setAttribute("cy", bbox.y + bbox.height / 2);
  circle.setAttribute("r", r);
  circle.setAttribute("class", "hold-circle");
  circle.id = `${noteId}-circle`;
  circle.style.stroke = "var(--accent)";
  circle.style.strokeWidth = "4px";
  circle.style.fill = "none";
  circle.style.pointerEvents = "none";
  const circumference = 2 * Math.PI * r;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference;
  circle.style.opacity = "0";
  el.appendChild(circle);
}

function updateHoldVisual(note, progress) {
  const circle = document.getElementById(`${note.id}-circle`);
  if (!circle) return;
  const circumference = 2 * Math.PI * 24;
  circle.style.strokeDashoffset = circumference * (1 - progress);
  circle.style.opacity = progress > 0 ? "1" : "0";
}

function finalizeHoldVisual(note, success) {
  const circle = document.getElementById(`${note.id}-circle`);
  if (!circle) return;
  if (success) { circle.classList.add('success'); circle.style.strokeDashoffset = 0; circle.style.stroke = "#10b981"; circle.style.opacity = "1"; }
  else { circle.classList.add('failed'); circle.style.opacity = "0"; }
}

function gameLoop(timestamp) {
  if (!isPlaying || isPaused || countInActive) return;
  const currentTime = audioCtx.currentTime;
  const elapsedAudio = currentTime - audioStartTime;
  if (elapsedAudio < 0) { animationId = requestAnimationFrame(gameLoop); return; }
  const beatDuration = 60 / bpm;
  const currentBeat = elapsedAudio / beatDuration;
  if (metronomeEnabled) {
    const floorBeat = Math.floor(currentBeat);
    if (floorBeat > lastBeatPlayed) { playMetronomeTick(floorBeat % BEATS_PER_MEASURE === 0); lastBeatPlayed = floorBeat; }
  }
  const currentX = trackBaseX + (currentBeat * PIXELS_PER_BEAT);
  document.getElementById('sweepLine').style.left = `${currentX}px`;
  
  const currentFingering = getPressedFingering();
  notesOnStaff.forEach((note, index) => {
    if (note.processed) return;
    const nextNote = notesOnStaff[index + 1];
    const holdEnd = nextNote ? nextNote.x : note.x + note.durationPixels;
    if (currentX >= note.x - EVAL_TOLERANCE) {
      if (!note.active) note.active = true;
      if (currentFingering === note.fingering) {
        const progress = Math.min(1, (currentX - note.x) / (holdEnd - note.x));
        updateHoldVisual(note, progress);
        if (currentX >= note.x) startNoteSound(note.pitchStr, note.accidental);
        if (currentX >= holdEnd - EVAL_TOLERANCE) { note.processed = true; note.hit = true; handleHit(note); finalizeHoldVisual(note, true); stopNoteSound(); }
      } else {
        if (currentX > note.x + EVAL_TOLERANCE) { note.processed = true; handleMiss(note); finalizeHoldVisual(note, false); stopNoteSound(); }
        else { stopNoteSound(); updateHoldVisual(note, 0); }
      }
    }
  });
  const totalMeasuresWidth = 12 * PIXELS_PER_MEASURE;
  if (currentX > trackBaseX + totalMeasuresWidth + 200) { endGame(); return; }
  const scroll = document.getElementById('scrollingTrack');
  if (currentX > scroll.clientWidth * 0.6) scroll.scrollLeft = currentX - scroll.clientWidth * 0.4;
  animationId = requestAnimationFrame(gameLoop);
}

function startNoteSound(pitch, acc) {
  if (!audioCtx || currentNoteOsc) return;
  const parts = pitch.split('/');
  let step = parts[0].toUpperCase();
  const oct = parseInt(parts[1], 10);
  if (acc === 'b') step += 'b';
  if (acc === '#') step += '#';
  const freq = getFreq(step, oct);
  currentNoteOsc = audioCtx.createOscillator();
  currentNoteGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  currentNoteOsc.type = 'sawtooth';
  currentNoteOsc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = freq * 3;
  currentNoteGain.gain.setValueAtTime(0, audioCtx.currentTime);
  currentNoteGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
  currentNoteOsc.connect(filter); filter.connect(currentNoteGain); currentNoteGain.connect(audioCtx.destination);
  currentNoteOsc.start();
}

function stopNoteSound() {
  if (currentNoteOsc) {
    const t = audioCtx.currentTime;
    currentNoteGain.gain.cancelScheduledValues(t);
    currentNoteGain.gain.setValueAtTime(currentNoteGain.gain.value, t);
    currentNoteGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    currentNoteOsc.stop(t + 0.05);
    currentNoteOsc = null; currentNoteGain = null;
  }
}

function getPressedFingering() {
  let p = []; if (activeValves[1]) p.push("1"); if (activeValves[2]) p.push("2"); if (activeValves[3]) p.push("3");
  return p.length === 0 ? "0" : p.join("");
}
function handleHit(note) { score += 100 + (combo * 10); combo++; updateStats(); triggerFeedback(true); highlightNote(note.id, "#10b981"); }
function handleMiss(note) { combo = 0; updateStats(); triggerFeedback(false); highlightNote(note.id, "#ef4444"); }
function highlightNote(noteId, color) { const el = document.getElementById(noteId); if (el) el.querySelectorAll('path').forEach(p => { p.setAttribute('fill', color); p.setAttribute('stroke', color); }); }
function triggerFeedback(isHit) { const el = isHit ? document.getElementById('feedbackHit') : document.getElementById('feedbackMiss'); if (el) { el.classList.add('feedback-active'); setTimeout(() => el.classList.remove('feedback-active'), 600); } }
function endGame() { isPlaying = false; stopNoteSound(); document.getElementById('gameControls').style.display = 'none'; if (animationId) cancelAnimationFrame(animationId); document.getElementById('resultsOverlay').style.display = 'flex'; document.getElementById('finalScore').innerText = score; }
function getFreq(step, octave) { const notes = { 'C':0, 'C#':1, 'DB':1, 'D':2, 'D#':3, 'EB':3, 'E':4, 'F':5, 'F#':6, 'GB':6, 'G':7, 'G#':8, 'AB':8, 'A':9, 'A#':10, 'BB':10, 'B':11 }; const midi = notes[step.toUpperCase()] + (octave + 1) * 12; return 440 * Math.pow(2, (midi - 69) / 12); }
window.addEventListener('keydown', (e) => { if (document.activeElement.tagName === 'INPUT') return; const key = e.key.toLowerCase(); if (key === 'j') { activeValves[1] = true; updateKeyVisual('keyJ', true); } if (key === 'k') { activeValves[2] = true; updateKeyVisual('keyK', true); } if (key === 'l') { activeValves[3] = true; updateKeyVisual('keyL', true); } if (key === 'p') pauseGame(); });
window.addEventListener('keyup', (e) => { if (document.activeElement.tagName === 'INPUT') return; const key = e.key.toLowerCase(); if (key === 'j') { activeValves[1] = false; updateKeyVisual('keyJ', false); } if (key === 'k') { activeValves[2] = false; updateKeyVisual('keyK', false); } if (key === 'l') { activeValves[3] = false; updateKeyVisual('keyL', false); } });
function updateKeyVisual(id, active) { const el = document.getElementById(id); if (el) active ? el.classList.add('active') : el.classList.remove('active'); if (id === 'keyJ') updateVisualValve(1, active); if (id === 'keyK') updateVisualValve(2, active); if (id === 'keyL') updateVisualValve(3, active); }
function updateVisualValve(num, active) { const el = document.getElementById(`visualValve${num}`); if (el) active ? el.classList.add('active') : el.classList.remove('active'); }
