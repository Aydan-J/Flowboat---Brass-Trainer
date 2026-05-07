// js/rhythm-practice.js

// --- State ---
let bpm = 80;
let isPlaying = false;
let isPaused = false;
let notesOnStaff = [];
let score = 0;
let totalHits = 0;
let correctHits = 0;

let startTime = 0;
let audioStartTime = 0;
let animationId = null;
let audioCtx = null;

let metronomeEnabled = true;
let sweepLineEnabled = true;
let exerciseLength = '4'; 
let includeRests = false;

const PIXELS_PER_BEAT = 100;
const BEATS_PER_MEASURE = 4;
const PIXELS_PER_MEASURE = PIXELS_PER_BEAT * BEATS_PER_MEASURE;
const HIT_WINDOW = 60; 

let currentPattern = null; 
let hasMistakeInCurrentSession = false;
let lastBeatPlayed = -1;
let countInActive = false;
let trackBaseX = 100;

document.addEventListener('DOMContentLoaded', () => {
  const startGameBtn = document.getElementById('startGameBtn');
  const restartBtn = document.getElementById('restartBtn');
  const quitBtn = document.getElementById('quitBtn');

  if (startGameBtn) startGameBtn.addEventListener('click', startGame);
  if (restartBtn) restartBtn.addEventListener('click', startGame);
  if (quitBtn) quitBtn.addEventListener('click', () => location.reload());
  
  window.addEventListener('keydown', handleInput);
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
    exerciseLength = document.getElementById('lengthSelect').value;
    metronomeEnabled = document.getElementById('metronomeCheck').checked;
    sweepLineEnabled = document.getElementById('sweepCheck').checked;
    includeRests = document.getElementById('restCheck').checked;

    score = 0; totalHits = 0; correctHits = 0; hasMistakeInCurrentSession = false;
    updateStats();
    notesOnStaff = [];
    document.getElementById('staffContainer').innerHTML = '';
    
    generateTrack();
    
    // Set base X from first note
    trackBaseX = notesOnStaff.length > 0 ? notesOnStaff[0].x : 100;

    document.getElementById('gameOverlay').style.display = 'none';
    document.getElementById('gameControls').style.display = 'flex';
    
    const sweepLine = document.getElementById('sweepLine');
    sweepLine.style.display = sweepLineEnabled ? 'block' : 'none';
    sweepLine.style.left = `${trackBaseX}px`;
    
    document.getElementById('scrollingTrack').scrollLeft = 0;
    
    isPlaying = true; countInActive = true; lastBeatPlayed = -1;
    if (metronomeEnabled) await performCountIn();
    
    countInActive = false;
    audioStartTime = ctx.currentTime;
    startTime = performance.now();
    
    if (animationId) cancelAnimationFrame(animationId);
    requestAnimationFrame(gameLoop);
  } catch (e) {
    console.error("Failed to start game:", e);
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

function updateStats() {
  document.getElementById('scoreVal').innerText = score;
  const acc = totalHits > 0 ? Math.round((correctHits / totalHits) * 100) : 100;
  document.getElementById('accuracyVal').innerText = acc;
  document.getElementById('currentBpmDisplay').innerText = `${bpm} BPM`;
}

function generateTrack() {
  const VF = Vex.Flow;
  const numMeasures = exerciseLength === '4' ? 4 : 16;
  const totalWidth = numMeasures * PIXELS_PER_MEASURE + 800;
  const container = document.getElementById('staffContainer');
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, 300);
  const context = renderer.getContext();
  
  let xOffset = 100;
  const staffPitches = ['e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5', 'd/5', 'e/5', 'f/5'];
  const DUR_VALS = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5 };

  if (exerciseLength === '4') {
    if (!currentPattern) currentPattern = generateRandomPattern(4, includeRests, staffPitches);
  } else {
    currentPattern = generateRandomPattern(numMeasures, includeRests, staffPitches);
  }

  currentPattern.forEach((measureData, m) => {
    const stave = new VF.Stave(xOffset, 40, PIXELS_PER_MEASURE);
    if (m === 0) stave.addClef('treble').addTimeSignature('4/4');
    if (m === currentPattern.length - 1) stave.setEndBarType(VF.Barline.type.END);
    stave.setContext(context).draw();

    const vfNotes = [];
    measureData.forEach(noteData => {
      const note = new VF.StaveNote({ 
        keys: [noteData.pitch], 
        duration: noteData.isRest ? noteData.duration + "r" : noteData.duration 
      });
      vfNotes.push(note);
    });

    const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(vfNotes);
    new VF.Formatter().joinVoices([voice]).format([voice], PIXELS_PER_MEASURE - (m === 0 ? 100 : 20));
    
    let subB = 0;
    vfNotes.forEach((note, i) => {
      const noteData = measureData[i];
      if (note.getTickContext()) note.getTickContext().setX(subB * PIXELS_PER_BEAT);
      
      note.setStave(stave).setContext(context).draw();
      
      if (!noteData.isRest) {
        notesOnStaff.push({
          x: note.getAbsoluteX(),
          processed: false,
          hit: false
        });
      }
      subB += DUR_VALS[noteData.duration];
    });
    xOffset += PIXELS_PER_MEASURE;
  });
}

function generateRandomPattern(num, rests, pitches) {
  const pattern = [];
  const DUR_KEYS = ['q', 'h', '8'];
  const DUR_VALS = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5 };
  for (let m = 0; m < num; m++) {
    const measure = []; let beats = 0;
    while (beats < 4) {
      let dur = DUR_KEYS[Math.floor(Math.random() * DUR_KEYS.length)];
      if (beats + DUR_VALS[dur] > 4) {
        if (beats + 1 <= 4) dur = 'q';
        else if (beats + 0.5 <= 4) dur = '8';
        else break;
      }
      const isRest = rests && Math.random() < 0.2;
      const pitch = pitches[Math.floor(Math.random() * pitches.length)];
      measure.push({ duration: dur, isRest, pitch });
      beats += DUR_VALS[dur];
    }
    pattern.push(measure);
  }
  return pattern;
}

function gameLoop(timestamp) {
  if (!isPlaying || countInActive) return;
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
  if (sweepLineEnabled) document.getElementById('sweepLine').style.left = `${currentX}px`;
  notesOnStaff.forEach(note => {
    if (!note.processed && currentX > note.x + HIT_WINDOW) { note.processed = true; hasMistakeInCurrentSession = true; }
  });
  const endX = trackBaseX + (currentPattern.length * PIXELS_PER_MEASURE);
  if (currentX > endX + 50) { endGame(); return; }
  const scroll = document.getElementById('scrollingTrack');
  if (currentX > scroll.clientWidth * 0.6) scroll.scrollLeft = currentX - scroll.clientWidth * 0.4;
  animationId = requestAnimationFrame(gameLoop);
}

function handleInput(e) {
  if (!isPlaying || countInActive || e.code !== 'Space') return;
  e.preventDefault();
  playWoodenClick();
  const currentTime = audioCtx.currentTime;
  const elapsedAudio = currentTime - audioStartTime;
  const beatDuration = 60 / bpm;
  const currentBeat = elapsedAudio / beatDuration;
  const currentX = trackBaseX + (currentBeat * PIXELS_PER_BEAT);
  let closest = null; let minDist = Infinity;
  notesOnStaff.forEach(note => {
    if (!note.processed) {
      const dist = Math.abs(currentX - note.x);
      if (dist < minDist) { minDist = dist; closest = note; }
    }
  });
  totalHits++;
  if (closest && minDist < HIT_WINDOW) { closest.processed = true; closest.hit = true; correctHits++; score += 100; spawnArrow(currentX, true); }
  else { spawnArrow(currentX, false); hasMistakeInCurrentSession = true; }
  updateStats();
}

function spawnArrow(x, isCorrect) {
  const container = document.getElementById('scrollingTrack');
  const arrow = document.createElement('div');
  arrow.className = `arrow-marker ${isCorrect ? 'arrow-green' : 'arrow-red'}`;
  arrow.style.left = `${x}px`; arrow.innerText = '↑';
  container.appendChild(arrow);
  setTimeout(() => { arrow.style.transition = 'opacity 1s'; arrow.style.opacity = '0'; setTimeout(() => arrow.remove(), 1000); }, 2000);
}

function endGame() {
  isPlaying = false; if (animationId) cancelAnimationFrame(animationId);
  const msg = document.getElementById('messageBox');
  const allCorrect = !hasMistakeInCurrentSession && correctHits === notesOnStaff.length && totalHits === notesOnStaff.length;
  if (exerciseLength === '4') {
    if (!allCorrect) { msg.innerText = "❌ Missed some notes! Let's try that pattern again."; msg.className = "wrong"; setTimeout(startGame, 2000); }
    else { msg.innerText = "✅ All Correct! Generating new pattern..."; msg.className = "correct"; currentPattern = null; setTimeout(startGame, 2000); }
  } else {
    msg.innerText = allCorrect ? "✅ Perfect Run!" : `Session Finished. Accuracy: ${Math.round((correctHits/totalHits)*100)}%`;
    msg.className = allCorrect ? "correct" : ""; document.getElementById('gameOverlay').style.display = 'flex'; document.getElementById('gameControls').style.display = 'none';
  }
}

function playMetronomeTick(isStrong) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = isStrong ? 1200 : 800;
  gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.05);
}

function playWoodenClick() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(400, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
  gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.05);
}
