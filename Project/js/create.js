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
let bpm = 120;

// Musical state: array of measures.
let measures = [
  []
];

const TICKS_PER_BEAT = 4096; 
const DUR_TICKS = {
  'w': TICKS_PER_BEAT * 4,
  'h': TICKS_PER_BEAT * 2,
  'q': TICKS_PER_BEAT,
  '8': TICKS_PER_BEAT / 2,
  '16': TICKS_PER_BEAT / 4
};

// Staff constants
const MEASURE_WIDTH = 300;
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
    measures.push([]);
  }
  
  renderScore();

  const container = document.getElementById('editorScrollContainer');
  container.addEventListener('click', handleStaffClick);
  container.addEventListener('mousemove', handleHover);
  container.addEventListener('mouseleave', () => {
    const ghost = document.getElementById('ghostGroup');
    if (ghost) ghost.style.display = 'none';
  });
  
  // Re-render on resize to adjust wrapping
  window.addEventListener('resize', () => {
    if(resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(renderScore, 200);
  });
});

let resizeTimeout = null;

// ── UI / TOOLBAR ─────────────────────────────────────
function setupToolbar() {
  document.getElementById('clefSelect').addEventListener('change', (e) => {
    currentClef = e.target.value; renderScore(); saveToStorage();
  });
  document.getElementById('timeSigSelect').addEventListener('change', (e) => {
    timeSig = e.target.value; renderScore(); saveToStorage();
  });

  document.getElementById('durationGroup').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      document.querySelectorAll('#durationGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
      e.target.classList.add('active-tool');
      currentDuration = e.target.dataset.duration;
      isDeleteMode = false;
      document.getElementById('deleteModeBtn').classList.remove('active-tool');
    }
  });

  document.getElementById('accidentalGroup').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      document.querySelectorAll('#accidentalGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
      e.target.classList.add('active-tool');
      currentAccidental = e.target.dataset.accidental;
    }
  });

  document.getElementById('deleteModeBtn').addEventListener('click', (e) => {
    isDeleteMode = !isDeleteMode;
    e.target.classList.toggle('active-tool', isDeleteMode);
    if (isDeleteMode) {
      document.querySelectorAll('#durationGroup .tool-btn').forEach(b => b.classList.remove('active-tool'));
    } else {
      document.querySelector(`#durationGroup .tool-btn[data-duration="${currentDuration}"]`).classList.add('active-tool');
    }
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all notes?")) {
      measures = [[]]; renderScore(); saveToStorage();
    }
  });

  document.getElementById('exportPngBtn').addEventListener('click', exportToPng);
  document.getElementById('playBtn').addEventListener('click', startPlayback);
  document.getElementById('stopBtn').addEventListener('click', stopPlayback);
  
  document.getElementById('bpmInput').addEventListener('change', (e) => {
    bpm = parseInt(e.target.value, 10) || 120; saveToStorage();
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── VEXFLOW RENDERING ────────────────────────────────
let renderedBoundingBoxes = []; 
let renderedStaves = [];

function getTicksPerMeasure() {
  const parts = timeSig.split('/');
  return parseInt(parts[0], 10) * ((4 / parseInt(parts[1], 10)) * TICKS_PER_BEAT);
}

function getRestsForTicks(ticksRemaining) {
  let rests = [];
  let remaining = ticksRemaining;
  const durMap = [
    { dur: 'w', t: DUR_TICKS['w'] }, { dur: 'h', t: DUR_TICKS['h'] },
    { dur: 'q', t: DUR_TICKS['q'] }, { dur: '8', t: DUR_TICKS['8'] }, { dur: '16', t: DUR_TICKS['16'] }
  ];
  while (remaining >= DUR_TICKS['16']) {
    for (let i = 0; i < durMap.length; i++) {
      if (remaining >= durMap[i].t) {
        rests.push({ keys: ["b/4"], duration: durMap[i].dur, type: "r", accidental: "none" });
        remaining -= durMap[i].t;
        break;
      }
    }
  }
  return rests;
}

function renderScore() {
  const container = document.getElementById('staffContainer');
  container.innerHTML = '';
  renderedBoundingBoxes = [];
  renderedStaves = [];

  const wrapperWidth = document.getElementById('editorContainerWrapper').clientWidth - 64; // minus padding
  const maxWidth = Math.max(600, wrapperWidth);

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  const context = renderer.getContext();
  
  const measureTicks = getTicksPerMeasure();
  let xOffset = 10;
  let yOffset = STAFF_Y_START;

  for (let m = 0; m < measures.length; m++) {
    // Check wrapping
    let requiredWidth = MEASURE_WIDTH + (m === 0 || xOffset === 10 ? 70 : 0);
    if (xOffset + requiredWidth > maxWidth && xOffset > 10) {
      xOffset = 10;
      yOffset += SYSTEM_HEIGHT;
      requiredWidth = MEASURE_WIDTH + 70; // new line gets clef
    }

    const stave = new VF.Stave(xOffset, yOffset, requiredWidth);
    stave.yOffset = yOffset; // custom property for playback
    
    if (m === 0 || xOffset === 10) {
      stave.addClef(currentClef).addTimeSignature(timeSig);
    }
    
    stave.setContext(context).draw();
    renderedStaves.push(stave);

    let currentTicks = 0;
    let vfNotes = [];
    const mNotes = measures[m];
    
    for (let i = 0; i < mNotes.length; i++) {
      const nData = mNotes[i];
      const ticks = DUR_TICKS[nData.duration];
      if (currentTicks + ticks > measureTicks) break; 
      
      const vfNote = new VF.StaveNote({
        clef: currentClef, keys: nData.keys, duration: nData.duration + (nData.type === 'r' ? 'r' : '')
      });
      if (nData.type !== 'r' && nData.accidental !== 'none') {
        vfNote.addModifier(new VF.Accidental(nData.accidental), 0);
      }
      vfNotes.push(vfNote);
      
      renderedBoundingBoxes.push({
        measureIndex: m, noteIndex: i, vfNote: vfNote, stave: stave,
        ticksAtStart: currentTicks, isUserNote: true
      });
      currentTicks += ticks;
    }

    // Pad rests
    if (currentTicks < measureTicks) {
      const padRests = getRestsForTicks(measureTicks - currentTicks);
      for (let r = 0; r < padRests.length; r++) {
        const rData = padRests[r];
        const vfRest = new VF.StaveNote({
          clef: currentClef, keys: ["b/4"], duration: rData.duration + "r"
        });
        vfNotes.push(vfRest);
        
        renderedBoundingBoxes.push({
          measureIndex: m, noteIndex: mNotes.length + r, vfNote: vfRest, stave: stave,
          ticksAtStart: currentTicks, isUserNote: false, virtualDuration: rData.duration
        });
        currentTicks += DUR_TICKS[rData.duration];
      }
    }

    if (vfNotes.length > 0) {
      const voice = new VF.Voice({ num_beats: parseInt(timeSig.split('/')[0]), beat_value: parseInt(timeSig.split('/')[1]) });
      voice.addTickables(vfNotes);
      new VF.Formatter().joinVoices([voice]).format([voice], stave.getNoteStartX() ? requiredWidth - 50 : requiredWidth);
      voice.draw(context, stave);
    }
    xOffset += stave.getWidth();
  }
  
  renderer.resize(maxWidth, yOffset + SYSTEM_HEIGHT);
}

// ── INTERACTION & HOVER ──────────────────────────────
const CLEF_LINES = {
  treble: { steps: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], baseOctave: 4, baseStepIdx: 2 }, // E4
  bass:   { steps: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], baseOctave: 2, baseStepIdx: 4 }, // G2
  alto:   { steps: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], baseOctave: 3, baseStepIdx: 3 }  // F3
};

function yToPitchData(y, stave) {
  const line = stave.getLineForY(y);
  const offsetFromBottomLine = Math.round((4 - line) * 2);
  const clefData = CLEF_LINES[currentClef] || CLEF_LINES.treble;
  
  const totalSteps = clefData.baseStepIdx + offsetFromBottomLine;
  const octave = clefData.baseOctave + Math.floor(totalSteps / 7);
  const stepName = clefData.steps[((totalSteps % 7) + 7) % 7];
  
  // Snap Y accurately to the nearest VexFlow line/space
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
  return renderedStaves[renderedStaves.length - 1]; // fallback
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
  
  // Create or get ghost group
  let ghost = document.getElementById('ghostGroup');
  if (!ghost) {
    ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
    ghost.setAttribute("id", "ghostGroup");
    ghost.style.pointerEvents = "none";
    ghost.style.opacity = "0.5";
    
    const head = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    head.setAttribute("rx", "6");
    head.setAttribute("ry", "4");
    head.setAttribute("fill", "#3b82f6");
    head.setAttribute("transform", "rotate(-20)");
    head.setAttribute("id", "ghostHead");
    ghost.appendChild(head);
    svg.appendChild(ghost);
  }

  ghost.style.display = 'block';
  ghost.setAttribute("transform", `translate(${svgP.x}, ${pitchData.y})`);

  // Draw ledger lines if outside staff (line < 0 or line > 4)
  // Clean up old ledgers
  ghost.querySelectorAll('.ledger').forEach(el => el.remove());

  if (pitchData.line <= -1) { // Above staff
    for (let l = -1; l >= pitchData.line; l--) {
      const ly = (l - pitchData.line) * 10;
      addLedger(ghost, ly);
    }
  } else if (pitchData.line >= 5) { // Below staff
    for (let l = 5; l <= pitchData.line; l++) {
      const ly = (l - pitchData.line) * 10;
      addLedger(ghost, ly);
    }
  }
}

function addLedger(group, yOffset) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "ledger");
  line.setAttribute("x1", "-12"); line.setAttribute("x2", "12");
  line.setAttribute("y1", yOffset); line.setAttribute("y2", yOffset);
  line.setAttribute("stroke", "#3b82f6");
  line.setAttribute("stroke-width", "1.5");
  group.appendChild(line);
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
    const mIdx = clickedItem.measureIndex;
    const nIdx = clickedItem.noteIndex;
    
    if (isDeleteMode) {
      if (clickedItem.isUserNote) {
        measures[mIdx][nIdx].type = 'r';
        measures[mIdx][nIdx].keys = ["b/4"];
        measures[mIdx][nIdx].accidental = "none";
      }
    } else {
      const pitchData = yToPitchData(svgP.y, clickedItem.stave);
      const newNote = { keys: [pitchData.pitch], duration: currentDuration, type: 'n', accidental: currentAccidental };

      if (clickedItem.isUserNote) {
        measures[mIdx][nIdx] = newNote; // Replace
      } else {
        measures[mIdx].push(newNote); // Insert
        
        let mTicks = 0;
        for(let n of measures[mIdx]) mTicks += DUR_TICKS[n.duration];
        if (mTicks > getTicksPerMeasure()) {
           showToast("Doesn't fit in measure! Created new measure.");
           measures[mIdx].pop(); 
           if (mIdx === measures.length - 1) measures.push([]);
           measures[mIdx + 1].push(newNote);
        }
      }
    }
    
    let lastMTicks = 0;
    const lastM = measures[measures.length-1];
    for(let n of lastM) lastMTicks += DUR_TICKS[n.duration];
    if (lastMTicks >= getTicksPerMeasure()) measures.push([]);

    renderScore(); saveToStorage();
  } else {
    // Clicked empty space
    const stave = getStaveForPoint(svgP.x, svgP.y);
    if (!stave) return;
    const pitchData = yToPitchData(svgP.y, stave);
    const newNote = { keys: [pitchData.pitch], duration: currentDuration, type: 'n', accidental: currentAccidental };
    const mIdx = measures.length - 1;
    
    let mTicks = 0;
    for(let n of measures[mIdx]) mTicks += DUR_TICKS[n.duration];
    if (mTicks + DUR_TICKS[newNote.duration] <= getTicksPerMeasure()) {
       measures[mIdx].push(newNote);
    } else {
       measures.push([newNote]);
    }
    renderScore(); saveToStorage();
  }
}

// ── LOCAL STORAGE ────────────────────────────────────
function saveToStorage() {
  localStorage.setItem('valvetrainer_create', JSON.stringify({ measures, clef: currentClef, timeSig, bpm }));
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem('valvetrainer_create');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.measures) measures = data.measures;
      if (data.clef) { currentClef = data.clef; document.getElementById('clefSelect').value = currentClef; }
      if (data.timeSig) { timeSig = data.timeSig; document.getElementById('timeSigSelect').value = timeSig; }
      if (data.bpm) { bpm = data.bpm; document.getElementById('bpmInput').value = bpm; }
    }
  } catch(e) { console.error("Load failed", e); }
}

// ── PLAYBACK ENGINE ──────────────────────────────────
function startPlayback() {
  if (isPlaying) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  isPlaying = true;
  document.getElementById('playBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  
  playbackNotes = [];
  let absoluteTick = 0;
  
  for (let m = 0; m < measures.length; m++) {
    let mTicks = 0;
    for (let i = 0; i < measures[m].length; i++) {
      const note = measures[m][i];
      const ticks = DUR_TICKS[note.duration];
      
      const renderedObj = renderedBoundingBoxes.find(b => b.measureIndex === m && b.noteIndex === i && b.isUserNote);
      if (renderedObj) {
        playbackNotes.push({
          pitch: note.keys[0], accidental: note.accidental,
          durationTicks: ticks, startTick: absoluteTick,
          xPos: renderedObj.vfNote.getAbsoluteX(),
          yOffset: renderedObj.stave.yOffset,
          isRest: note.type === 'r',
          staveXEnd: renderedObj.stave.getX() + renderedObj.stave.getWidth()
        });
      }
      absoluteTick += ticks;
      mTicks += ticks;
    }
    
    // Rests padding
    const measureTotalTicks = getTicksPerMeasure();
    if (mTicks < measureTotalTicks) {
      // Find padding rests to log their positions for the sweep line
      const pads = renderedBoundingBoxes.filter(b => b.measureIndex === m && !b.isUserNote);
      for (let p of pads) {
        const pTicks = DUR_TICKS[p.virtualDuration];
        playbackNotes.push({
          isRest: true, durationTicks: pTicks, startTick: absoluteTick,
          xPos: p.vfNote.getAbsoluteX(), yOffset: p.stave.yOffset, staveXEnd: p.stave.getX() + p.stave.getWidth()
        });
        absoluteTick += pTicks;
      }
    }
  }
  
  if (playbackNotes.length === 0) { stopPlayback(); return; }
  
  startTime = audioCtx.currentTime + 0.1;
  const ticksPerSecond = (bpm / 60) * TICKS_PER_BEAT;
  
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
  
  // Trumpet tone
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  
  // Vibrato (LFO)
  vibrato.frequency.value = 5.5; // 5.5 Hz vibrato
  vibratoGain.gain.value = freq * 0.015; // pitch depth
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.detune);
  
  // Brass filter envelope
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(freq, time);
  filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 6, 8000), time + 0.05);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + duration);
  
  // Volume envelope
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.7, time + 0.03);
  gain.gain.setValueAtTime(0.7, time + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(time);
  vibrato.start(time + 0.2); // Delay vibrato slightly
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
  
  // Find current note and next note for interpolation
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
    
    let endX = activeNote.xPos + 30; // default width if no next note
    if (nextNote && nextNote.yOffset === activeNote.yOffset) {
      endX = nextNote.xPos;
    } else if (nextNote && nextNote.yOffset !== activeNote.yOffset) {
      // Next note is on a new line, interpolate to the end of the current stave
      endX = activeNote.staveXEnd;
    }
    
    // Smooth interpolation
    targetX = activeNote.xPos + progress * (endX - activeNote.xPos);
  } else if (playbackNotes.length > 0 && currentTick < playbackNotes[playbackNotes.length-1].startTick + playbackNotes[playbackNotes.length-1].durationTicks) {
    // We are between notes? Shouldn't happen with padding, but fallback
    targetX = playbackNotes[playbackNotes.length-1].staveXEnd;
    targetY = playbackNotes[playbackNotes.length-1].yOffset;
  }
  
  const line = document.getElementById('playbackSweepLine');
  line.style.left = `${targetX}px`;
  line.style.top = `${targetY - 10}px`;
  line.style.height = `120px`; // Cover staff height
  
  // Stop if passed total ticks
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
