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
let pauseOffset = 0;
let animationId = null;
let audioCtx = null;

// The game evaluates when the line is within this range of the note center
const EVAL_TOLERANCE = 15; // pixels
const PIXELS_PER_MEASURE = 400;
const BEATS_PER_MEASURE = 4;

// --- Initialize when DOM is ready ---
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
}

function startGame() {
  initAudio();
  
  const bpmInput = document.getElementById('bpmInput');
  const keySigSelect = document.getElementById('keySigSelect');
  const restCheck = document.getElementById('restCheck');
  const accidentalCheck = document.getElementById('accidentalCheck');
  const lowLimitSelect = document.getElementById('lowLimitSelect');
  const highLimitSelect = document.getElementById('highLimitSelect');

  bpm = parseInt(bpmInput.value) || 80;
  keySignature = keySigSelect.value;
  includeRests = restCheck.checked;
  includeAccidentals = accidentalCheck.checked;
  
  allowedDurations = [];
  document.querySelectorAll('.dur-check:checked').forEach(cb => allowedDurations.push(cb.value));
  if (allowedDurations.length === 0) allowedDurations = ['q'];

  const allNotes = Object.keys(FINGERINGS.trumpet);
  const lowIdx = allNotes.indexOf(lowLimitSelect.value);
  const highIdx = allNotes.indexOf(highLimitSelect.value);
  noteRange = allNotes.slice(lowIdx, highIdx + 1);

  document.getElementById('currentBpmDisplay').innerText = `${bpm} BPM`;
  score = 0;
  combo = 0;
  updateStats();
  
  notesOnStaff = [];
  document.getElementById('staffContainer').innerHTML = '';
  
  try {
    generateTrack();
  } catch (e) {
    console.error("Critical Error during track generation:", e);
    alert("Error generating notes. Please check your settings.");
    return;
  }
  
  document.getElementById('gameOverlay').style.display = 'none';
  document.getElementById('pauseOverlay').style.display = 'none';
  document.getElementById('resultsOverlay').style.display = 'none';
  document.getElementById('gameControls').style.display = 'flex';
  
  const sweepLine = document.getElementById('sweepLine');
  sweepLine.style.display = 'block';
  sweepLine.style.left = '0px';
  
  document.getElementById('scrollingTrack').scrollLeft = 0;
  
  isPlaying = true;
  isPaused = false;
  startTime = performance.now();
  pauseOffset = 0;
  
  if (animationId) cancelAnimationFrame(animationId);
  requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (!isPlaying || isPaused) return;
  isPaused = true;
  pauseOffset = performance.now() - startTime;
  document.getElementById('pauseOverlay').style.display = 'flex';
  cancelAnimationFrame(animationId);
}

function resumeGame() {
  if (!isPaused) return;
  isPaused = false;
  startTime = performance.now() - pauseOffset;
  document.getElementById('pauseOverlay').style.display = 'none';
  requestAnimationFrame(gameLoop);
}

function updateStats() {
  document.getElementById('scoreVal').innerText = score;
  document.getElementById('comboVal').innerText = combo;
}

function generateTrack() {
  const VF = Vex.Flow;
  const numMeasures = 12;
  const totalWidth = numMeasures * PIXELS_PER_MEASURE + 600;
  
  const staffContainer = document.getElementById('staffContainer');
  const renderer = new VF.Renderer(staffContainer, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, 300);
  const context = renderer.getContext();
  
  let xOffset = 50;
  
  let filteredRange = includeAccidentals 
    ? noteRange 
    : noteRange.filter(n => !n.includes('#') && !n.includes('b'));
  
  if (filteredRange.length === 0) {
    filteredRange = noteRange; 
  }

  for (let m = 0; m < numMeasures; m++) {
    const stave = new VF.Stave(xOffset, 40, PIXELS_PER_MEASURE);
    if (m === 0) {
      stave.addClef('treble').addTimeSignature('4/4').addKeySignature(keySignature);
    }
    if (m === numMeasures - 1) stave.setEndBarType(VF.Barline.type.END);
    stave.setContext(context).draw();
    
    const measureNotesData = [];
    let currentBeats = 0;
    const DUR_VALS = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5 };
    
    while (currentBeats < 4) {
      let dur = allowedDurations[Math.floor(Math.random() * allowedDurations.length)];
      if (currentBeats + DUR_VALS[dur] > 4) {
        if (currentBeats + 1 <= 4) dur = 'q';
        else if (currentBeats + 0.5 <= 4) dur = '8';
        else break;
      }
      
      const isRest = includeRests && Math.random() < 0.15;
      if (isRest) {
        const rest = new VF.StaveNote({ keys: ["b/4"], duration: dur + "r" });
        measureNotesData.push({ vfNote: rest, isRest: true, duration: dur });
      } else {
        const noteName = filteredRange[Math.floor(Math.random() * filteredRange.length)];
        const match = noteName.match(/^([A-G])([b#]?)([0-9])$/);
        const baseKey = match[1];
        const baseAccidental = match[2];
        const octave = match[3];
        
        const vfKey = `${baseKey.toLowerCase()}/${octave}`;
        const note = new VF.StaveNote({ keys: [vfKey], duration: dur });
        
        let effectiveAcc = 'none';
        const keyAcc = KEY_ACCIDENTALS[keySignature][baseKey.toUpperCase()] || 'none';
        
        if (baseAccidental) {
          effectiveAcc = baseAccidental;
          if (baseAccidental !== keyAcc) note.addAccidental(0, new VF.Accidental(baseAccidental));
        } else {
          effectiveAcc = keyAcc;
        }
        
        const noteId = `note-${notesOnStaff.length + measureNotesData.length}`;
        measureNotesData.push({
          vfNote: note,
          isRest: false,
          fingering: FINGERINGS.trumpet[noteName][0],
          noteName: noteName,
          pitchStr: vfKey,
          accidental: effectiveAcc,
          id: noteId
        });
      }
      currentBeats += DUR_VALS[dur];
    }
    
    const vfTickables = measureNotesData.map(n => n.vfNote);
    const voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
    voice.addTickables(vfTickables);
    
    new VF.Formatter().joinVoices([voice]).format([voice], PIXELS_PER_MEASURE - (m === 0 ? 120 : 50));
    
    measureNotesData.forEach((noteData) => {
      noteData.vfNote.setStave(stave).setContext(context);
      if (!noteData.isRest) {
        context.openGroup(noteData.id, "vf-note-group");
        noteData.vfNote.draw();
        context.closeGroup();
        
        notesOnStaff.push({
          id: noteData.id,
          x: noteData.vfNote.getAbsoluteX(),
          fingering: noteData.fingering,
          hit: false,
          processed: false,
          pitchStr: noteData.pitchStr,
          accidental: noteData.accidental
        });
      } else {
        noteData.vfNote.draw();
      }
    });
    
    xOffset += PIXELS_PER_MEASURE;
  }
}

function gameLoop(timestamp) {
  if (!isPlaying || isPaused) return;
  
  const elapsed = timestamp - startTime;
  const beatDuration = (60 / bpm) * 1000;
  const measureDuration = beatDuration * BEATS_PER_MEASURE;
  
  const pixelsPerMs = PIXELS_PER_MEASURE / measureDuration;
  const currentX = 50 + (elapsed * pixelsPerMs);
  
  document.getElementById('sweepLine').style.left = `${currentX}px`;
  
  const currentFingering = getPressedFingering();
  
  notesOnStaff.forEach(note => {
    if (!note.processed) {
      // Logic: Evaluation point is when currentX JUST crosses note.x
      if (currentX >= note.x) {
         if (currentFingering === note.fingering) {
            note.hit = true;
            note.processed = true;
            handleHit(note);
         } else {
            // Give a TINY window (EVAL_TOLERANCE) to catch it if they were frame-perfect
            // Otherwise, it's a miss
            if (currentX > note.x + EVAL_TOLERANCE) {
               note.processed = true;
               handleMiss(note);
            }
         }
      }
    }
  });
  
  const lastNote = notesOnStaff[notesOnStaff.length - 1];
  if (lastNote && currentX > lastNote.x + 300) {
    endGame();
    return;
  }
  
  const scrollingTrack = document.getElementById('scrollingTrack');
  if (currentX > scrollingTrack.clientWidth * 0.6) {
    scrollingTrack.scrollLeft = currentX - scrollingTrack.clientWidth * 0.4;
  }
  
  animationId = requestAnimationFrame(gameLoop);
}

function getPressedFingering() {
  let pressed = [];
  if (activeValves[1]) pressed.push("1");
  if (activeValves[2]) pressed.push("2");
  if (activeValves[3]) pressed.push("3");
  if (pressed.length === 0) return "0";
  return pressed.join("");
}

function handleHit(note) {
  score += 100 + (combo * 10);
  combo++;
  updateStats();
  triggerFeedback(true);
  playNoteSample(note.pitchStr, note.accidental);
  highlightNote(note.id, "#10b981"); 
}

function handleMiss(note) {
  combo = 0;
  updateStats();
  triggerFeedback(false);
  highlightNote(note.id, "#ef4444"); 
}

function highlightNote(noteId, color) {
  const el = document.getElementById(noteId);
  if (el) {
    const paths = el.querySelectorAll('path');
    paths.forEach(p => {
      p.setAttribute('fill', color);
      p.setAttribute('stroke', color);
    });
  }
}

function triggerFeedback(isHit) {
  const el = isHit ? document.getElementById('feedbackHit') : document.getElementById('feedbackMiss');
  const other = isHit ? document.getElementById('feedbackMiss') : document.getElementById('feedbackHit');
  
  other.classList.remove('feedback-active');
  el.classList.add('feedback-active');
  
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove('feedback-active'), 600);
}

function endGame() {
  isPlaying = false;
  document.getElementById('gameControls').style.display = 'none';
  if (animationId) cancelAnimationFrame(animationId);
  document.getElementById('resultsOverlay').style.display = 'flex';
  document.getElementById('finalScore').innerText = score;
}

function playNoteSample(pitchStr, accidental) {
  if (!audioCtx) return;
  scheduleTrumpetNote(pitchStr, accidental, audioCtx.currentTime, 0.4);
}

function scheduleTrumpetNote(pitchStr, acc, time, duration) {
  const parts = pitchStr.split('/');
  let step = parts[0].toUpperCase();
  const oct = parseInt(parts[1], 10);
  if (acc === 'b') step += 'b';
  if (acc === '#') step += '#';
  const freq = getFreq(step, oct);
  
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  const vibrato = audioCtx.createOscillator();
  const vibratoGain = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  vibrato.frequency.value = 5.5; 
  vibratoGain.gain.value = freq * 0.015;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.detune);
  
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(freq, time);
  filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 6, 8000), time + 0.05);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + duration);
  
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.7, time + 0.03);
  gain.gain.setValueAtTime(0.7, time + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(time);
  vibrato.start(time + 0.2); 
  osc.stop(time + duration);
  vibrato.stop(time + duration);
}

function getFreq(step, octave) {
  const notes = { 'C':0, 'C#':1, 'DB':1, 'D':2, 'D#':3, 'EB':3, 'E':4, 'F':5, 'F#':6, 'GB':6, 'G':7, 'G#':8, 'AB':8, 'A':9, 'A#':10, 'BB':10, 'B':11 };
  const midi = notes[step.toUpperCase()] + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  const key = e.key.toLowerCase();
  if (key === 'j') { activeValves[1] = true; updateKeyVisual('keyJ', true); }
  if (key === 'k') { activeValves[2] = true; updateKeyVisual('keyK', true); }
  if (key === 'l') { activeValves[3] = true; updateKeyVisual('keyL', true); }
  if (key === 'p') pauseGame();
});

window.addEventListener('keyup', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  const key = e.key.toLowerCase();
  if (key === 'j') { activeValves[1] = false; updateKeyVisual('keyJ', false); }
  if (key === 'k') { activeValves[2] = false; updateKeyVisual('keyK', false); }
  if (key === 'l') { activeValves[3] = false; updateKeyVisual('keyL', false); }
});

function updateKeyVisual(id, active) {
  const el = document.getElementById(id);
  if (el) {
    if (active) el.classList.add('active');
    else el.classList.remove('active');
  }

  // Also update the visual valve display
  if (id === 'keyJ') updateVisualValve(1, active);
  if (id === 'keyK') updateVisualValve(2, active);
  if (id === 'keyL') updateVisualValve(3, active);
}

function updateVisualValve(num, active) {
  const el = document.getElementById(`visualValve${num}`);
  if (el) {
    if (active) el.classList.add('active');
    else el.classList.remove('active');
  }
}
