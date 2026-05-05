/* ====================================================
   create.js — Notation Editor
   Interactive sheet music creation using VexFlow.
==================================================== */

const VF = Vex.Flow;

// ── STATE ────────────────────────────────────────────
let currentClef = 'treble';
let timeSig = '4/4';
let currentDuration = 'q';
let currentAccidental = 'none';
let isDeleteMode = false;
let isTripletMode = false;
let bpm = 120;
let keySignature = 'C';

const KEY_ACCIDENTALS = {
  'C': {},
  'G': { 'F': '#' },
  'D': { 'F': '#', 'C': '#' },
  'A': { 'F': '#', 'C': '#', 'G': '#' },
  'E': { 'F': '#', 'C': '#', 'G': '#', 'D': '#' },
  'B': { 'F': '#', 'C': '#', 'G': '#', 'D': '#', 'A': '#' },
  'F': { 'B': 'b' },
  'Bb': { 'B': 'b', 'E': 'b' },
  'Eb': { 'B': 'b', 'E': 'b', 'A': 'b' },
  'Ab': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b' },
  'Db': { 'B': 'b', 'E': 'b', 'A': 'b', 'D': 'b', 'G': 'b' }
};

let measures = [];
let selectedNoteInfo = null; // { mIdx, nIdx }

// History for Undo/Redo
let historyStack = [];
let historyPtr = -1;

// Multiplied by 3 to support perfect triplets without precision loss
const TICKS_PER_BEAT = 12288; 
const DUR_TICKS = {
  'w': TICKS_PER_BEAT * 4,
  'h': TICKS_PER_BEAT * 2,
  'q': TICKS_PER_BEAT,
  '8': TICKS_PER_BEAT / 2,
  '16': TICKS_PER_BEAT / 4
};

// Staff constants
const STAFF_Y_START = 50;
const SYSTEM_HEIGHT = 130;

// Playback state
let audioCtx = null;
let isPlaying = false;
let playAnimFrame = null;
let startTime = 0;
let playbackNotes = []; 

// ── INITIALIZATION ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupToolbar();
  loadFromStorage();
  
  if (measures.length === 0) {
    measures.push(getRestsForTicks(getTicksPerMeasure()));
    saveState(); 
  }
  
  renderScore();

  const container = document.getElementById('editorScrollContainer');
  container.addEventListener('click', handleStaffClick);
  container.addEventListener('mousemove', handleHover);
  container.addEventListener('mouseleave', () => {
    const ghost = document.getElementById('ghostGroup');
    if (ghost) ghost.style.display = 'none';
  });
  
  window.addEventListener('resize', () => {
    if(resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(renderScore, 200);
  });

  // Pitch Shifting Key Events
  document.addEventListener('keydown', handleKeyboard);
});

let resizeTimeout = null;

// ── KEYBOARD LOGIC ───────────────────────────────────
function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT') return;
  
  if (!selectedNoteInfo) return;
  
  // Navigation
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    let { mIdx, nIdx } = selectedNoteInfo;
    if (e.key === 'ArrowRight') {
      nIdx++;
      if (nIdx >= measures[mIdx].length) {
        mIdx++; nIdx = 0;
      }
    } else {
      nIdx--;
      if (nIdx < 0) {
        mIdx--;
        if (mIdx >= 0) nIdx = measures[mIdx].length - 1;
      }
    }
    
    if (mIdx >= 0 && mIdx < measures.length) {
      selectedNoteInfo = { mIdx, nIdx };
      updateToolbarToMatchSelection();
      const nextNote = measures[mIdx][nIdx];
      if (nextNote.type === 'n') {
        playNoteSample(nextNote.keys[0], nextNote.accidental);
      }
      renderScore();
    }
    return;
  }

  // Pitch Shifting
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const { mIdx, nIdx } = selectedNoteInfo;
    const note = measures[mIdx][nIdx];
    if (note.type === 'r') return; // Can't shift rest
    
    const dir = e.key === 'ArrowUp' ? 1 : -1;
    const newPitch = shiftPitch(note.keys[0], note.accidental, dir);
    note.keys[0] = newPitch.keys[0];
    note.accidental = newPitch.accidental;
    
    saveState(); renderScore(); saveToStorage();
    playNoteSample(note.keys[0], note.accidental);
    return;
  }

  // Shortcuts for accidentals
  if (e.key === '-' || e.key === '=' || e.key === '+' || e.key === '0') {
    e.preventDefault();
    let acc = 'none';
    if (e.key === '-') acc = 'b';
    if (e.key === '=' || e.key === '+') acc = '#';
    if (e.key === '0') acc = 'n';
    
    document.querySelector(`#accidentalGroup .tool-btn[data-accidental="${acc}"]`)?.click();
  }
}

function shiftPitch(pitchStr, acc, dir) {
  const parts = pitchStr.split('/');
  let step = parts[0].toUpperCase();
  let oct = parseInt(parts[1], 10);
  
  let effAcc = acc;
  if (effAcc === 'none') {
      effAcc = KEY_ACCIDENTALS[keySignature][step] || 'none';
  }
  
  const notes = { 'C':0, 'D':2, 'E':4, 'F':5, 'G':7, 'A':9, 'B':11 };
  let midi = notes[step] + (oct * 12);
  if (effAcc === 'b') midi -= 1;
  else if (effAcc === '#') midi += 1;
  
  midi += dir;
  
  const octOut = Math.floor(midi / 12);
  const noteIdx = ((midi % 12) + 12) % 12;
  
  const midiToStep = [
    ['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'],
    ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'], ['B']
  ];
  
  const candidates = midiToStep[noteIdx];
  let outStep = '';
  let outAcc = '';
  
  for (let cand of candidates) {
      let cStep = cand[0];
      let cAcc = cand.length > 1 ? cand[1] : 'none';
      if (cAcc === '#') cAcc = '#';
      if (cAcc === 'b') cAcc = 'b';
      
      let keyAcc = KEY_ACCIDENTALS[keySignature][cStep] || 'none';
      if (keyAcc === cAcc) {
          outStep = cStep;
          outAcc = 'none'; 
          break;
      }
  }
  
  if (!outStep) {
      let cand = candidates[0];
      outStep = cand[0];
      outAcc = cand.length > 1 ? cand[1] : 'n'; 
      if (cand.length === 1) outAcc = 'n';
  }
  
  return { keys: [`${outStep.toLowerCase()}/${octOut}`], accidental: outAcc };
}

// ── UI / TOOLBAR ─────────────────────────────────────
function setupToolbar() {
  document.getElementById('clefSelect').addEventListener('change', (e) => {
    currentClef = e.target.value; renderScore(); saveToStorage();
  });
  document.getElementById('timeSigSelect').addEventListener('change', (e) => {
    timeSig = e.target.value; 
    measures = [getRestsForTicks(getTicksPerMeasure())];
    selectedNoteInfo = null;
    saveState(); renderScore(); saveToStorage();
  });
  document.getElementById('keySigSelect').addEventListener('change', (e) => {
    keySignature = e.target.value;
    renderScore(); saveToStorage();
  });

  document.getElementById('durationGroup').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      document.querySelectorAll('#durationGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
      e.target.classList.add('active-tool');
      currentDuration = e.target.dataset.duration;
      isDeleteMode = false;
      document.getElementById('deleteModeBtn').classList.remove('active-tool');
      
      if (selectedNoteInfo) applyDurationToSelection(currentDuration);
    }
  });

  document.getElementById('tripletToggleBtn').addEventListener('click', (e) => {
    isTripletMode = !isTripletMode;
    e.target.classList.toggle('active-tool', isTripletMode);
    
    if (selectedNoteInfo) {
      applyDurationToSelection(currentDuration); 
    }
  });

  document.getElementById('accidentalGroup').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      document.querySelectorAll('#accidentalGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
      e.target.classList.add('active-tool');
      currentAccidental = e.target.dataset.accidental;
      
      if (selectedNoteInfo) applyAccidentalToSelection(currentAccidental);
    }
  });

  document.getElementById('deleteModeBtn').addEventListener('click', (e) => {
    isDeleteMode = !isDeleteMode;
    e.target.classList.toggle('active-tool', isDeleteMode);
    if (isDeleteMode) {
      document.querySelectorAll('#durationGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
      if (selectedNoteInfo) deleteSelection();
    } else {
      document.querySelector(`#durationGroup .tool-btn[data-duration="${currentDuration}"]`).classList.add('active-tool');
    }
  });

  document.getElementById('addMeasureBtn').addEventListener('click', addMeasure);
  
  document.getElementById('breakBeamBtn').addEventListener('click', () => {
    if (!selectedNoteInfo) return;
    const note = measures[selectedNoteInfo.mIdx][selectedNoteInfo.nIdx];
    note.beamBreak = !note.beamBreak;
    saveState(); renderScore(); saveToStorage();
  });

  document.getElementById('forceBeamBtn').addEventListener('click', () => {
    if (!selectedNoteInfo) return;
    const note = measures[selectedNoteInfo.mIdx][selectedNoteInfo.nIdx];
    note.forceBeam = !note.forceBeam;
    saveState(); renderScore(); saveToStorage();
  });

  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all notes?")) {
      measures = [getRestsForTicks(getTicksPerMeasure())];
      selectedNoteInfo = null;
      saveState(); renderScore(); saveToStorage();
    }
  });

  document.getElementById('exportPngBtn').addEventListener('click', exportToPng);
  document.getElementById('playBtn').addEventListener('click', startPlayback);
  document.getElementById('stopBtn').addEventListener('click', stopPlayback);
  
  document.getElementById('bpmInput').addEventListener('change', (e) => {
    bpm = parseInt(e.target.value, 10) || 120; saveToStorage();
  });
}

function updateToolbarToMatchSelection() {
  if (!selectedNoteInfo) return;
  const note = measures[selectedNoteInfo.mIdx][selectedNoteInfo.nIdx];
  if (note.type === 'n') {
    currentDuration = note.duration;
    currentAccidental = note.accidental || 'none';
    
    if (note.isTriplet !== isTripletMode) {
      isTripletMode = !!note.isTriplet;
      document.getElementById('tripletToggleBtn').classList.toggle('active-tool', isTripletMode);
    }

    updateToolbarUI();
  }
}

function updateToolbarUI() {
  document.querySelectorAll('#durationGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
  document.querySelector(`#durationGroup .tool-btn[data-duration="${currentDuration}"]`)?.classList.add('active-tool');
  
  document.querySelectorAll('#accidentalGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
  document.querySelector(`#accidentalGroup .tool-btn[data-accidental="${currentAccidental}"]`)?.classList.add('active-tool');
}

function revertAccidental() {
  currentAccidental = 'none';
  updateToolbarUI();
}

// ── MODIFYING SELECTION ──────────────────────────────
function applyAccidentalToSelection(acc) {
  const { mIdx, nIdx } = selectedNoteInfo;
  const note = measures[mIdx][nIdx];
  if (note.type === 'n') {
    note.accidental = acc;
    saveState(); renderScore(); saveToStorage();
    playNoteSample(note.keys[0], acc);
  }
}

function applyDurationToSelection(newDur) {
  const { mIdx, nIdx } = selectedNoteInfo;
  const existing = measures[mIdx][nIdx];
  if (existing.duration === newDur && !!existing.isTriplet === isTripletMode) return;
  
  insertNoteAt(mIdx, nIdx, existing.keys[0], newDur, existing.type, existing.accidental, isTripletMode);
}

function deleteSelection() {
  const { mIdx, nIdx } = selectedNoteInfo;
  const existing = measures[mIdx][nIdx];
  if (existing.type === 'n') {
    measures[mIdx][nIdx] = { keys: ["b/4"], duration: existing.duration, type: 'r', accidental: 'none', isTriplet: existing.isTriplet };
    saveState(); renderScore(); saveToStorage();
  }
}

function addMeasure() {
  measures.push(getRestsForTicks(getTicksPerMeasure()));
  saveState(); renderScore(); saveToStorage();
  showToast("Added new measure.");
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── UNDO / REDO ──────────────────────────────────────
function saveState() {
  historyStack.length = historyPtr + 1;
  historyStack.push(JSON.parse(JSON.stringify(measures)));
  historyPtr++;
  updateUndoRedoUI();
}

function undo() {
  if (historyPtr > 0) {
    historyPtr--;
    measures = JSON.parse(JSON.stringify(historyStack[historyPtr]));
    selectedNoteInfo = null;
    renderScore(); saveToStorage(); updateUndoRedoUI();
  }
}

function redo() {
  if (historyPtr < historyStack.length - 1) {
    historyPtr++;
    measures = JSON.parse(JSON.stringify(historyStack[historyPtr]));
    selectedNoteInfo = null;
    renderScore(); saveToStorage(); updateUndoRedoUI();
  }
}

function updateUndoRedoUI() {
  document.getElementById('undoBtn').disabled = historyPtr <= 0;
  document.getElementById('redoBtn').disabled = historyPtr >= historyStack.length - 1;
}

// ── ENGINE LOGIC ─────────────────────────────────────
function getTicksPerMeasure() {
  const parts = timeSig.split('/');
  return parseInt(parts[0], 10) * ((4 / parseInt(parts[1], 10)) * TICKS_PER_BEAT);
}

function getRestsForTicks(ticksRemaining) {
  let rests = [];
  let remaining = ticksRemaining;
  const standardMap = [
    { dur: 'w', t: DUR_TICKS['w'], trip: false },
    { dur: 'h', t: DUR_TICKS['h'], trip: false },
    { dur: 'q', t: DUR_TICKS['q'], trip: false },
    { dur: '8', t: DUR_TICKS['8'], trip: false },
    { dur: '16', t: DUR_TICKS['16'], trip: false }
  ];
  const tripMap = [
    { dur: 'q', t: DUR_TICKS['q']*2/3, trip: true },
    { dur: '8', t: DUR_TICKS['8']*2/3, trip: true },
    { dur: '16', t: DUR_TICKS['16']*2/3, trip: true }
  ];

  while (remaining >= DUR_TICKS['16']*2/3) {
    if (remaining % 3072 === 0) {
      for (let i = 0; i < standardMap.length; i++) {
        if (remaining >= standardMap[i].t) {
          rests.push({ keys: ["b/4"], duration: standardMap[i].dur, type: "r", accidental: "none", isTriplet: false });
          remaining -= standardMap[i].t;
          break;
        }
      }
    } else {
      let found = false;
      for (let i = 0; i < tripMap.length; i++) {
        if (remaining >= tripMap[i].t) {
          rests.push({ keys: ["b/4"], duration: tripMap[i].dur, type: "r", accidental: "none", isTriplet: true });
          remaining -= tripMap[i].t;
          found = true;
          break;
        }
      }
      if (!found) break; // Safety fallback
    }
  }
  return rests;
}

function getBestDurationForTicks(ticks) {
  const standardMap = [
    { dur: 'w', t: DUR_TICKS['w'], trip: false },
    { dur: 'h', t: DUR_TICKS['h'], trip: false },
    { dur: 'q', t: DUR_TICKS['q'], trip: false },
    { dur: '8', t: DUR_TICKS['8'], trip: false },
    { dur: '16', t: DUR_TICKS['16'], trip: false }
  ];
  for (let d of standardMap) {
    if (ticks === d.t) return d;
  }
  
  const tripMap = [
    { dur: 'h', t: DUR_TICKS['h']*2/3, trip: true },
    { dur: 'q', t: DUR_TICKS['q']*2/3, trip: true },
    { dur: '8', t: DUR_TICKS['8']*2/3, trip: true },
    { dur: '16', t: DUR_TICKS['16']*2/3, trip: true }
  ];
  for (let d of tripMap) {
    if (ticks === d.t) return d;
  }
  
  for (let d of standardMap) {
    if (ticks >= d.t) return d;
  }
  return standardMap[standardMap.length - 1];
}

function getTicksForNote(noteObj) {
  return noteObj.isTriplet ? DUR_TICKS[noteObj.duration] * 2 / 3 : DUR_TICKS[noteObj.duration];
}

function isScoreFull() {
  const lastM = measures[measures.length - 1];
  for (let n of lastM) {
    if (n.type === 'r') return false;
  }
  return true;
}

function insertNoteAt(mIdx, nIdx, pitch, newDuration, type, accidental, isTriplet = false) {
  const existing = measures[mIdx][nIdx];
  const newTicks = isTriplet ? DUR_TICKS[newDuration] * 2 / 3 : DUR_TICKS[newDuration];
  const oldTicks = getTicksForNote(existing);

  if (newTicks < oldTicks) {
    // Split
    measures[mIdx][nIdx] = { keys: [pitch], duration: newDuration, type: type, accidental: accidental, isTriplet: isTriplet };
    const padRests = getRestsForTicks(oldTicks - newTicks);
    measures[mIdx].splice(nIdx + 1, 0, ...padRests);
  } 
  else if (newTicks > oldTicks) {
    // Consume
    let gatheredTicks = oldTicks;
    let consumeCount = 0;
    
    for (let i = nIdx + 1; i < measures[mIdx].length; i++) {
      if (gatheredTicks >= newTicks) break;
      gatheredTicks += getTicksForNote(measures[mIdx][i]);
      consumeCount++;
    }

    if (gatheredTicks < newTicks) {
      const best = getBestDurationForTicks(gatheredTicks);
      newDuration = best.dur;
      isTriplet = best.trip;
      showToast(`Truncated to fit measure`);
    }

    measures[mIdx].splice(nIdx, consumeCount + 1, { 
      keys: [pitch], duration: newDuration, type: type, accidental: accidental, isTriplet: isTriplet 
    });

    const resultingTicks = isTriplet ? DUR_TICKS[newDuration] * 2 / 3 : DUR_TICKS[newDuration];
    if (gatheredTicks > resultingTicks) {
      const padRests = getRestsForTicks(gatheredTicks - resultingTicks);
      measures[mIdx].splice(nIdx + 1, 0, ...padRests);
    }
  } else {
    // Exact match
    measures[mIdx][nIdx] = { keys: [pitch], duration: newDuration, type: type, accidental: accidental, isTriplet: isTriplet };
  }
  
  if (isScoreFull()) {
    measures.push(getRestsForTicks(getTicksPerMeasure()));
  }

  saveState(); renderScore(); saveToStorage();
  revertAccidental(); 
}

// ── VEXFLOW RENDERING ────────────────────────────────
let renderedBoundingBoxes = []; 
let renderedStaves = [];

function renderScore() {
  const container = document.getElementById('staffContainer');
  container.innerHTML = '';
  renderedBoundingBoxes = [];
  renderedStaves = [];

  const wrapper = document.getElementById('editorContainerWrapper');
  const maxWidth = Math.max(600, wrapper.clientWidth - 40); 

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  const context = renderer.getContext();
  const svg = context.svg; 
  
  let maxNoteCount = 0;
  for (let m = 0; m < measures.length; m++) {
    if (measures[m].length > maxNoteCount) maxNoteCount = measures[m].length;
  }
  const globalMinMeasureWidth = 50 + (maxNoteCount * 22); 
  
  let accCount = 0;
  if (keySignature !== 'C') {
      accCount = Object.keys(KEY_ACCIDENTALS[keySignature]).length;
  }
  const modifierWidth = 60 + (accCount * 12); // Clef + TimeSig + KeySig

  const availableWidth = maxWidth - 20 - modifierWidth; 
  let measuresPerLine = Math.floor(availableWidth / globalMinMeasureWidth);
  if (measuresPerLine < 2) measuresPerLine = 2; 
  if (measuresPerLine > 8) measuresPerLine = 8; 
  
  const uniformWidth = availableWidth / measuresPerLine;
  
  let yOffset = STAFF_Y_START;
  let xOffset = 10;
  let measuresDrawnOnLine = 0;

  for (let m = 0; m < measures.length; m++) {
    const isFirstStaveOfLine = (measuresDrawnOnLine === 0);
    
    let requiredWidth = uniformWidth;
    if (isFirstStaveOfLine) {
      requiredWidth += modifierWidth;
    }

    const stave = new VF.Stave(xOffset, yOffset, requiredWidth);
    stave.yOffset = yOffset;
    
    if (isFirstStaveOfLine) {
      stave.addClef(currentClef).addTimeSignature(timeSig).addKeySignature(keySignature);
    }
    if (m === measures.length - 1) {
      stave.setEndBarType(VF.Barline.type.END);
    }
    
    stave.setContext(context).draw();
    renderedStaves.push(stave);

    let vfNotes = [];
    let currentTicks = 0;
    let activeAccidentals = {}; 
    let tripletGroups = [];
    let currentTripletGroup = [];
    
    for (let i = 0; i < measures[m].length; i++) {
      const nData = measures[m][i];
      const ticks = getTicksForNote(nData);
      
      const vfNote = new VF.StaveNote({
        clef: currentClef, keys: nData.keys, duration: nData.duration + (nData.type === 'r' ? 'r' : ''), auto_stem: true
      });

      if (nData.type !== 'r') {
         const pitch = nData.keys[0]; 
         const step = pitch.split('/')[0].toUpperCase();
         const currentAcc = nData.accidental; 
         
         const keyAcc = KEY_ACCIDENTALS[keySignature][step] || 'none';
         const activeAcc = activeAccidentals[pitch]; 
         
         let needsDrawing = false;
         
         if (activeAcc === undefined) {
             if (currentAcc !== keyAcc && currentAcc !== 'none') {
                 needsDrawing = true;
             }
         } else {
             if (currentAcc !== activeAcc && currentAcc !== 'none') {
                 needsDrawing = true;
             }
         }

         if (needsDrawing) {
             vfNote.addAccidental(0, new VF.Accidental(currentAcc));
             activeAccidentals[pitch] = currentAcc;
         } else if (activeAcc === undefined) {
             activeAccidentals[pitch] = keyAcc;
         }
      }

      if (selectedNoteInfo && selectedNoteInfo.mIdx === m && selectedNoteInfo.nIdx === i) {
        vfNote.setStyle({fillStyle: "#3b82f6", strokeStyle: "#3b82f6"});
      }

      // Keep reference for beaming break
      vfNote._nData = nData;
      
      vfNotes.push(vfNote);
      
      if (nData.isTriplet) {
         currentTripletGroup.push(vfNote);
         if (currentTripletGroup.length === 3) {
            tripletGroups.push(currentTripletGroup);
            currentTripletGroup = [];
         }
      } else {
         if (currentTripletGroup.length > 0) {
            tripletGroups.push(currentTripletGroup);
            currentTripletGroup = [];
         }
      }

      renderedBoundingBoxes.push({
        measureIndex: m, noteIndex: i, vfNote: vfNote, stave: stave,
        ticksAtStart: currentTicks
      });
      currentTicks += ticks;
    }
    
    if (currentTripletGroup.length > 0) {
       tripletGroups.push(currentTripletGroup);
    }

    if (vfNotes.length > 0) {
      const voice = new VF.Voice({ num_beats: parseInt(timeSig.split('/')[0]), beat_value: parseInt(timeSig.split('/')[1]) });
      let tuplets = tripletGroups.map(g => {
         const t = new VF.Tuplet(g, { num_notes: 3, notes_occupied: 2 });
         t.setTupletLocation(VF.Tuplet.LOCATION_TOP);
         return t;
      });
      
      voice.addTickables(vfNotes);
      
      // Auto-Beaming with manual breaks (only beam 8th and 16th notes)
      let beamGroups = [];
      let currentBeamGroup = [];
      for (let note of vfNotes) {
         const isBeamable = (note._nData.duration === '8' || note._nData.duration === '16') && note._nData.type !== 'r';
         if (note._nData.beamBreak || !isBeamable) {
            if (currentBeamGroup.length > 0) {
               beamGroups.push(currentBeamGroup);
               currentBeamGroup = [];
            }
         }
         if (isBeamable) {
            currentBeamGroup.push(note);
         }
      }
      if (currentBeamGroup.length > 0) beamGroups.push(currentBeamGroup);
      
      let allBeams = [];
      for (let group of beamGroups) {
         if (group.length > 1) {
             try {
                 const force = group.some(n => n._nData.forceBeam);
                 if (force) {
                     allBeams.push(new VF.Beam(group));
                 } else {
                     const beams = VF.Beam.generateBeams(group);
                     allBeams = allBeams.concat(beams);
                 }
             } catch(e) { console.error("Beam error", e); }
         }
      }
      const noteStartX = stave.getNoteStartX() || stave.getX();
      const noteEndX = stave.getNoteEndX() || (stave.getX() + stave.getWidth() - 10);
      const formatWidth = Math.max(50, noteEndX - noteStartX - 10);
      
      new VF.Formatter().joinVoices([voice]).format([voice], formatWidth);
      voice.draw(context, stave);
      allBeams.forEach(b => b.setContext(context).draw());
      tuplets.forEach(t => t.setContext(context).draw());
    }
    
    xOffset += stave.getWidth();
    measuresDrawnOnLine++;
    
    if (measuresDrawnOnLine >= measuresPerLine) {
       measuresDrawnOnLine = 0;
       xOffset = 10;
       yOffset += SYSTEM_HEIGHT;
    }
  }
  
  if (selectedNoteInfo) {
    const sBox = renderedBoundingBoxes.find(b => b.measureIndex === selectedNoteInfo.mIdx && b.noteIndex === selectedNoteInfo.nIdx);
    if (sBox) {
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const x = sBox.vfNote.getAbsoluteX() + 8; 
      const arrowY = sBox.stave.getYForLine(4) + 20; 
      arrow.setAttribute("d", `M ${x-6} ${arrowY+10} L ${x} ${arrowY} L ${x+6} ${arrowY+10} Z`);
      arrow.setAttribute("fill", "#3b82f6");
      arrow.setAttribute("class", "selection-arrow");
      svg.appendChild(arrow);
    }
  }

  renderer.resize(maxWidth + 10, yOffset + SYSTEM_HEIGHT);
}

// ── INTERACTION & HOVER ──────────────────────────────
const CLEF_LINES = {
  treble: { steps: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], baseOctave: 4, baseStepIdx: 2 },
  bass:   { steps: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], baseOctave: 2, baseStepIdx: 4 },
  alto:   { steps: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], baseOctave: 3, baseStepIdx: 3 }
};

function yToPitchData(y, stave) {
  const line = stave.getLineForY(y);
  const offsetFromBottomLine = Math.round((4 - line) * 2);
  const clefData = CLEF_LINES[currentClef] || CLEF_LINES.treble;
  
  const totalSteps = clefData.baseStepIdx + offsetFromBottomLine;
  const octave = clefData.baseOctave + Math.floor(totalSteps / 7);
  const stepName = clefData.steps[((totalSteps % 7) + 7) % 7];
  
  const snappedLine = 4 - (offsetFromBottomLine / 2);
  const snappedY = stave.getYForLine(snappedLine);
  
  return { pitch: `${stepName}/${octave}`, y: snappedY, line: snappedLine };
}

function getStaveForPoint(x, y) {
  for (let stave of renderedStaves) {
    if (y >= stave.yOffset - 30 && y <= stave.yOffset + 120) {
      if (x >= stave.getX() && x <= stave.getX() + stave.getWidth()) return stave;
    }
  }
  return renderedStaves[renderedStaves.length - 1];
}

function handleHover(e) {
  if (isDeleteMode || currentDuration === 'r') {
    const ghost = document.getElementById('ghostGroup');
    if (ghost) ghost.style.display = 'none';
    return;
  }

  const svg = document.querySelector('#staffContainer svg');
  if (!svg) return;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
  
  const stave = getStaveForPoint(svgP.x, svgP.y);
  if (!stave) return;
  const pitchData = yToPitchData(svgP.y, stave);
  
  let ghost = document.getElementById('ghostGroup');
  if (!ghost) {
    ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
    ghost.setAttribute("id", "ghostGroup");
    ghost.style.pointerEvents = "none";
    ghost.style.opacity = "0.5";
    
    const head = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    head.setAttribute("rx", "6"); head.setAttribute("ry", "4");
    head.setAttribute("fill", "#3b82f6"); head.setAttribute("transform", "rotate(-20)");
    ghost.appendChild(head);
    svg.appendChild(ghost);
  }

  ghost.style.display = 'block';
  ghost.setAttribute("transform", `translate(${svgP.x}, ${pitchData.y})`);

  ghost.querySelectorAll('.ledger').forEach(el => el.remove());
  if (pitchData.line <= -1) {
    for (let l = -1; l >= pitchData.line; l--) { addLedger(ghost, (l - pitchData.line) * 10); }
  } else if (pitchData.line >= 5) {
    for (let l = 5; l <= pitchData.line; l++) { addLedger(ghost, (l - pitchData.line) * 10); }
  }
}

function addLedger(group, yOffset) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "ledger");
  line.setAttribute("x1", "-12"); line.setAttribute("x2", "12");
  line.setAttribute("y1", yOffset); line.setAttribute("y2", yOffset);
  line.setAttribute("stroke", "#3b82f6"); line.setAttribute("stroke-width", "1.5");
  group.appendChild(line);
}

function initAudioIfNeeded() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playNoteSample(pitchStr, accidental) {
  initAudioIfNeeded();
  let effAcc = accidental;
  if (effAcc === 'none') {
      const step = pitchStr.split('/')[0].toUpperCase();
      effAcc = KEY_ACCIDENTALS[keySignature][step] || 'none';
  }
  scheduleTrumpetNote(pitchStr, effAcc, audioCtx.currentTime, 0.2);
}

function playMetronomeClick(time, isBeatOne) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = isBeatOne ? 880 : 440;
  
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.3, time + 0.01);
  gain.gain.linearRampToValueAtTime(0, time + 0.05);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + 0.05);
}

function handleStaffClick(e) {
  const svg = document.querySelector('#staffContainer svg');
  if (!svg) return;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
  
  let clickedItem = null;
  let minDistance = Infinity;

  for (let item of renderedBoundingBoxes) {
    const bbox = item.vfNote.getBoundingBox();
    if (!bbox) continue;
    const isInsideX = svgP.x >= bbox.getX() - 15 && svgP.x <= bbox.getX() + bbox.getW() + 15;
    const isInsideY = svgP.y >= item.stave.yOffset - 30 && svgP.y <= item.stave.yOffset + 100;
    if (isInsideX && isInsideY) {
      const dist = Math.abs(svgP.x - (bbox.getX() + bbox.getW()/2));
      if (dist < minDistance) { minDistance = dist; clickedItem = item; }
    }
  }

  if (clickedItem) {
    const { measureIndex: mIdx, noteIndex: nIdx } = clickedItem;
    const existing = measures[mIdx][nIdx];
    
    if (isDeleteMode) {
      if (existing.type === 'n') {
        measures[mIdx][nIdx] = { keys: ["b/4"], duration: existing.duration, type: 'r', accidental: 'none', isTriplet: existing.isTriplet };
        if (selectedNoteInfo && selectedNoteInfo.mIdx === mIdx && selectedNoteInfo.nIdx === nIdx) selectedNoteInfo = null;
        saveState(); renderScore(); saveToStorage();
      }
      return;
    }

    if (existing.type === 'n') {
       selectedNoteInfo = { mIdx, nIdx };
       updateToolbarToMatchSelection();
       playNoteSample(existing.keys[0], existing.accidental);
       renderScore();
       return;
    }

    if (selectedNoteInfo && selectedNoteInfo.mIdx === mIdx && selectedNoteInfo.nIdx === nIdx) {
       const pitchData = yToPitchData(svgP.y, clickedItem.stave);
       playNoteSample(pitchData.pitch, currentAccidental);
       insertNoteAt(mIdx, nIdx, pitchData.pitch, currentDuration, 'n', currentAccidental, isTripletMode);
       selectedNoteInfo = { mIdx, nIdx };
       renderScore();
    } else {
       selectedNoteInfo = { mIdx, nIdx };
       updateToolbarToMatchSelection();
       renderScore();
    }
    
  } else {
    selectedNoteInfo = null; 
    renderScore();
  }
}

// ── LOCAL STORAGE ────────────────────────────────────
function saveToStorage() {
  localStorage.setItem('valvetrainer_create', JSON.stringify({ version: 3, measures, clef: currentClef, timeSig, bpm, keySignature }));
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem('valvetrainer_create');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.version !== 3) { console.warn("Old save format detected. Starting fresh."); return; }
      if (data.measures && data.measures.length > 0) {
        measures = data.measures;
        historyStack = [JSON.parse(JSON.stringify(measures))];
        historyPtr = 0;
      }
      if (data.clef) { currentClef = data.clef; document.getElementById('clefSelect').value = currentClef; }
      if (data.timeSig) { timeSig = data.timeSig; document.getElementById('timeSigSelect').value = timeSig; }
      if (data.bpm) { bpm = data.bpm; document.getElementById('bpmInput').value = bpm; }
      if (data.keySignature) { keySignature = data.keySignature; document.getElementById('keySigSelect').value = keySignature; }
    }
  } catch(e) { console.error("Load failed", e); }
}

// ── PLAYBACK ENGINE ──────────────────────────────────
function startPlayback() {
  if (isPlaying) return;
  initAudioIfNeeded();
  isPlaying = true;
  document.getElementById('playBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  
  playbackNotes = [];
  let absoluteTick = 0;
  
  for (let m = 0; m < measures.length; m++) {
    for (let i = 0; i < measures[m].length; i++) {
      const note = measures[m][i];
      const ticks = getTicksForNote(note);
      
      const renderedObj = renderedBoundingBoxes.find(b => b.measureIndex === m && b.noteIndex === i);
      if (renderedObj) {
        let effAcc = note.accidental;
        if (effAcc === 'none') {
           const step = note.keys[0].split('/')[0].toUpperCase();
           effAcc = KEY_ACCIDENTALS[keySignature][step] || 'none';
        }
        playbackNotes.push({
          pitch: note.keys[0], accidental: effAcc,
          durationTicks: ticks, startTick: absoluteTick,
          xPos: renderedObj.vfNote.getAbsoluteX(),
          yOffset: renderedObj.stave.yOffset,
          isRest: note.type === 'r',
          staveXEnd: renderedObj.stave.getX() + renderedObj.stave.getWidth()
        });
      }
      absoluteTick += ticks;
    }
  }
  
  if (playbackNotes.length === 0) { stopPlayback(); return; }
  
  const numBeats = parseInt(timeSig.split('/')[0], 10);
  const beatSec = 60 / bpm;
  const countInSec = numBeats * beatSec;
  
  for (let i = 0; i < numBeats; i++) {
    playMetronomeClick(audioCtx.currentTime + (i * beatSec), i === 0);
  }
  
  startTime = audioCtx.currentTime + countInSec + 0.1;
  const ticksPerSecond = (bpm / 60) * (TICKS_PER_BEAT / (4 / parseInt(timeSig.split('/')[1])));
  
  for (let note of playbackNotes) {
    if (!note.isRest) {
      const timeOffset = note.startTick / ticksPerSecond;
      const durationSec = note.durationTicks / ticksPerSecond;
      scheduleTrumpetNote(note.pitch, note.accidental, startTime + timeOffset, durationSec);
    }
  }
  
  const sweep = document.getElementById('playbackSweepLine');
  sweep.style.display = 'block';
  playAnimFrame = requestAnimationFrame(updateSweepLine);
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

function updateSweepLine() {
  if (!isPlaying) return;
  const now = audioCtx.currentTime;
  const elapsed = now - startTime;
  if (elapsed < 0) { playAnimFrame = requestAnimationFrame(updateSweepLine); return; }
  
  const ticksPerSecond = (bpm / 60) * TICKS_PER_BEAT;
  const currentTick = elapsed * ticksPerSecond;
  
  let targetX = 0, targetY = STAFF_Y_START;
  
  let activeNote = null, nextNote = null;
  for (let i = 0; i < playbackNotes.length; i++) {
    if (playbackNotes[i].startTick <= currentTick && (playbackNotes[i].startTick + playbackNotes[i].durationTicks) > currentTick) {
      activeNote = playbackNotes[i];
      nextNote = playbackNotes[i + 1] || null;
      break;
    }
  }
  
  if (activeNote) {
    const progress = (currentTick - activeNote.startTick) / activeNote.durationTicks;
    targetY = activeNote.yOffset;
    
    let endX = activeNote.xPos + 30;
    if (nextNote && nextNote.yOffset === activeNote.yOffset) {
      endX = nextNote.xPos;
    } else if (nextNote && nextNote.yOffset !== activeNote.yOffset) {
      endX = activeNote.staveXEnd;
    }
    
    targetX = activeNote.xPos + progress * (endX - activeNote.xPos);
  } else if (playbackNotes.length > 0 && currentTick < playbackNotes[playbackNotes.length-1].startTick + playbackNotes[playbackNotes.length-1].durationTicks) {
    targetX = playbackNotes[playbackNotes.length-1].staveXEnd;
    targetY = playbackNotes[playbackNotes.length-1].yOffset;
  }
  
  const line = document.getElementById('playbackSweepLine');
  line.style.left = `${targetX}px`;
  line.style.top = `${targetY - 10}px`;
  line.style.height = `120px`; 
  
  const scrollContainer = document.getElementById('editorContainerWrapper');
  if (targetX > scrollContainer.scrollLeft + scrollContainer.clientWidth - 100) {
    scrollContainer.scrollLeft = targetX - scrollContainer.clientWidth / 2;
  }
  if (targetY > scrollContainer.scrollTop + scrollContainer.clientHeight - 150) {
    scrollContainer.scrollTop = targetY - scrollContainer.clientHeight / 2;
  }

  const totalTicks = measures.length * getTicksPerMeasure();
  if (currentTick >= totalTicks) {
    stopPlayback(); return;
  }
  
  playAnimFrame = requestAnimationFrame(updateSweepLine);
}

function stopPlayback() {
  isPlaying = false;
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  cancelAnimationFrame(playAnimFrame);
  document.getElementById('playBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('playbackSweepLine').style.display = 'none';
}

// ── EXPORT ───────────────────────────────────────────
function exportToPng() {
  const svg = document.querySelector('#staffContainer svg');
  if (!svg) return;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  if(!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
  const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement("canvas");
    canvas.width = svg.clientWidth; canvas.height = svg.clientHeight;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.download = "valvetrainer_score.png"; a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.src = url;
}
