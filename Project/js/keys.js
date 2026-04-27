// js/keys.js
// Virtual Valve Simulator logic

// --- Configuration & State ---
const FINGERINGS = {
  trumpet: {
    "F#3": ["123"], "G3": ["13"], "G#3": ["23"], "A3": ["12"], "Bb3": ["1"], "B3": ["2"],
    "C4": ["0"], "C#4": ["123"], "D4": ["13"], "Eb4": ["23"], "E4": ["12"], "F4": ["1"], "F#4": ["2"],
    "G4": ["0"], "G#4": ["23"], "A4": ["12"], "Bb4": ["1"], "B4": ["2"],
    "C5": ["0"], "C#5": ["12"], "D5": ["1"], "Eb5": ["2"], "E5": ["0"], "F5": ["1"], "F#5": ["2"], "G5": ["0"]
  },
  french_horn: {
    "C4": ["0"], "C#4": ["12"], "D4": ["1"], "Eb4": ["2"], "E4": ["0"], "F4": ["1"], "F#4": ["2"],
    "G4": ["0"], "G#4": ["23", "T23"], "A4": ["12", "T12"], "Bb4": ["1", "T1"], "B4": ["2", "T2"],
    "C5": ["0", "T0"], "C#5": ["12", "T12"], "D5": ["1", "T1"], "Eb5": ["2", "T2"],
    "E5": ["0", "T0"], "F5": ["1", "T1"], "F#5": ["2", "T2"], "G5": ["0", "T0"]
  },
  trombone: {
    "E2": ["7"], "F2": ["6"], "F#2": ["5"], "G2": ["4"], "G#2": ["3"], "A2": ["2"], "Bb2": ["1"],
    "B2": ["7"], "C3": ["6"], "C#3": ["5"], "D3": ["4"], "Eb3": ["3"], "E3": ["2"], "F3": ["1"],
    "F#3": ["5"], "G3": ["4"], "G#3": ["3"], "A3": ["2"], "Bb3": ["1"],
    "B3": ["4", "7"], "C4": ["3", "6"], "C#4": ["2", "5"], "D4": ["1", "4"], "Eb4": ["3"], "E4": ["2"], "F4": ["1", "4"]
  },
  tuba: {
    "E1": ["123"], "F1": ["13"], "F#1": ["23"], "G1": ["12"], "G#1": ["1"], "A1": ["2"], "Bb1": ["0"],
    "B1": ["123"], "C2": ["13"], "C#2": ["23"], "D2": ["12"], "Eb2": ["1"], "E2": ["2"], "F2": ["0"],
    "F#2": ["23"], "G2": ["12"], "G#2": ["1"], "A2": ["2"], "Bb2": ["0"]
  }
};

const FREQUENCIES = {
  trumpet: {
    "F#3": 185.00, "G3": 196.00, "G#3": 207.65, "A3": 220.00, "Bb3": 233.08, "B3": 246.94,
    "C4": 261.63, "C#4": 277.18, "D4": 293.66, "Eb4": 311.13, "E4": 329.63, "F4": 349.23, "F#4": 369.99,
    "G4": 392.00, "G#4": 415.30, "A4": 440.00, "Bb4": 466.16, "B4": 493.88,
    "C5": 523.25, "C#5": 554.37, "D5": 587.33, "Eb5": 622.25, "E5": 659.25, "F5": 698.46, "F#5": 739.99, "G5": 783.99
  },
  french_horn: {
    "C4": 174.61, "C#4": 185.00, "D4": 196.00, "Eb4": 207.65, "E4": 220.00, "F4": 233.08, "F#4": 246.94,
    "G4": 261.63, "G#4": 277.18, "A4": 293.66, "Bb4": 311.13, "B4": 329.63,
    "C5": 349.23, "C#5": 369.99, "D5": 392.00, "Eb5": 415.30, "E5": 440.00, "F5": 466.16, "F#5": 493.88, "G5": 523.25
  },
  trombone: {
    "E2": 82.41, "F2": 87.31, "F#2": 92.50, "G2": 98.00, "G#2": 103.83, "A2": 110.00, "Bb2": 116.54,
    "B2": 123.47, "C3": 130.81, "C#3": 138.59, "D3": 146.83, "Eb3": 155.56, "E3": 164.81, "F3": 174.61,
    "F#3": 185.00, "G3": 196.00, "G#3": 207.65, "A3": 220.00, "Bb3": 233.08,
    "B3": 246.94, "C4": 261.63, "C#4": 277.18, "D4": 293.66, "Eb4": 311.13, "E4": 329.63, "F4": 349.23
  },
  tuba: {
    "E1": 41.20, "F1": 43.65, "F#1": 46.25, "G1": 49.00, "G#1": 51.91, "A1": 55.00, "Bb1": 58.27,
    "B1": 61.74, "C2": 65.41, "C#2": 69.30, "D2": 73.42, "Eb2": 77.78, "E2": 82.41, "F2": 87.31,
    "F#2": 92.50, "G2": 98.00, "G#2": 103.83, "A2": 110.00, "Bb2": 116.54
  }
};

let currentInstrument = "trumpet";

let keybindings = {
  t: 'a',
  v1: 'j',
  v2: 'k',
  v3: 'l'
};

let activeValves = {
  t: false,
  1: false,
  2: false,
  3: false
};

let currentSlidePosition = "1";
let isBlowing = false;
let currentTargetNote = "C4";

let audioContext = null;
let masterGain = null;
let currentOscillator = null;
let soundEnabled = false;

// --- DOM Elements ---
const instrumentSelect = document.getElementById('instrumentSelect');
const bindT = document.getElementById('bindT');
const bindV1 = document.getElementById('bindV1');
const bindV2 = document.getElementById('bindV2');
const bindV3 = document.getElementById('bindV3');

const thumbKeybindGroup = document.getElementById('thumbKeybindGroup');
const valveKeybinds = document.getElementById('valveKeybinds');
const slideKeybinds = document.getElementById('slideKeybinds');

const targetNoteSelect = document.getElementById('targetNoteSelect');
const displayNote = document.getElementById('displayNote');
const statusIndicator = document.getElementById('statusIndicator');
const simContainer = document.getElementById('simContainer');
const soundToggle = document.getElementById('soundToggle');
const nextNoteBtn = document.getElementById('nextNoteBtn');
const chartTitle = document.getElementById('chartTitle');
const chartGrid = document.getElementById('chartGrid');

const valvesDisplay = document.getElementById('valvesDisplay');
const slideDisplay = document.getElementById('slideDisplay');
const slidePositionLabel = document.getElementById('slidePositionLabel');

const valveElements = {
  t: document.getElementById('valveT'),
  1: document.getElementById('valve1'),
  2: document.getElementById('valve2'),
  3: document.getElementById('valve3')
};

// --- Audio Synthesizer ---
function initAudio() {
  if (audioContext) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.5; // Volume control
  masterGain.connect(audioContext.destination);
}

function playNote(note) {
  if (!audioContext) {
    initAudio();
    soundEnabled = true;
    soundToggle.innerText = "🔊 Audio On";
    soundToggle.classList.remove("btn-secondary");
    soundToggle.classList.add("btn-primary");
  }
  
  if (!soundEnabled) return;
  
  if (currentOscillator) {
    stopNote();
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const freq = FREQUENCIES[currentInstrument][note];
  if (!freq) return;

  currentOscillator = audioContext.createOscillator();
  currentOscillator.type = 'sawtooth'; 
  
  const env = audioContext.createGain();
  env.connect(masterGain);
  
  env.gain.setValueAtTime(0, audioContext.currentTime);
  env.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.05); 
  env.gain.linearRampToValueAtTime(0.7, audioContext.currentTime + 0.2); 
  
  currentOscillator.connect(env);
  currentOscillator.frequency.value = freq;
  currentOscillator.start();
  
  currentOscillator.env = env;
}

function stopNote() {
  if (currentOscillator) {
    const env = currentOscillator.env;
    env.gain.cancelScheduledValues(audioContext.currentTime);
    const currentValue = env.gain.value || 0.7;
    env.gain.setValueAtTime(currentValue, audioContext.currentTime);
    env.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
    currentOscillator.stop(audioContext.currentTime + 0.1);
    currentOscillator = null;
  }
}

soundToggle.addEventListener('click', () => {
  if (!audioContext) initAudio();
  
  if (!soundEnabled) {
    soundEnabled = true;
    soundToggle.innerText = "🔊 Audio On";
    soundToggle.classList.remove("btn-secondary");
    soundToggle.classList.add("btn-primary");
  } else {
    soundEnabled = false;
    soundToggle.innerText = "🔇 Audio Off";
    soundToggle.classList.add("btn-secondary");
    soundToggle.classList.remove("btn-primary");
    stopNote();
  }
});

// --- Keybindings Setup ---
function setupKeybindListeners(inputEl, valveKey) {
  inputEl.addEventListener('keydown', (e) => {
    e.preventDefault();
    if (e.key === 'Tab' || e.key === 'Shift') return;
    
    const newKey = e.key.toLowerCase();
    keybindings[valveKey] = newKey;
    inputEl.value = newKey.toUpperCase();
    inputEl.blur(); 
  });
}

setupKeybindListeners(bindT, 't');
setupKeybindListeners(bindV1, 'v1');
setupKeybindListeners(bindV2, 'v2');
setupKeybindListeners(bindV3, 'v3');

// --- Simulator Logic ---
function updateChart() {
  if (currentInstrument === 'trumpet') {
    chartTitle.innerText = "Trumpet Fingering Chart";
  } else if (currentInstrument === 'french_horn') {
    chartTitle.innerText = "French Horn Fingering Chart";
  } else if (currentInstrument === 'trombone') {
    chartTitle.innerText = "Trombone Slide Position Chart";
  } else {
    chartTitle.innerText = "Tuba Fingering Chart";
  }
  
  chartGrid.innerHTML = '';
  const currentFings = FINGERINGS[currentInstrument];
  
  for (let note in currentFings) {
    let div = document.createElement('div');
    div.className = 'fingering-item';
    
    let fingerings = currentFings[note].map(f => {
      if (currentInstrument === 'trombone') return f;
      if (f === '0') return 'Open';
      if (f === 'T0') return 'Thumb';
      return f.split('').join('-');
    }).join(' / ');
    
    div.innerHTML = `<span class="fingering-note">${note}</span><span class="fingering-valves">${fingerings}</span>`;
    chartGrid.appendChild(div);
  }
}

function populateSelect() {
  targetNoteSelect.innerHTML = '';
  for (let note in FINGERINGS[currentInstrument]) {
    let opt = document.createElement('option');
    opt.value = note;
    opt.innerText = note;
    if (currentInstrument === 'trombone' && note === "F3") opt.selected = true;
    else if (currentInstrument === 'tuba' && note === "Bb1") opt.selected = true;
    else if (note === "C4" && currentInstrument !== 'tuba' && currentInstrument !== 'trombone') opt.selected = true;
    targetNoteSelect.appendChild(opt);
  }
  updateChart();
}

function setTargetNote(note) {
  currentTargetNote = note;
  displayNote.innerText = note;
  targetNoteSelect.value = note;
  statusIndicator.innerText = "Hold SPACEBAR to Blow Air 💨";
  statusIndicator.className = "status-indicator";
  simContainer.classList.remove("flash-success");
}

instrumentSelect.addEventListener('change', (e) => {
  currentInstrument = e.target.value;
  
  // UI toggles based on instrument
  if (currentInstrument === 'trombone') {
    valveKeybinds.style.display = 'none';
    slideKeybinds.style.display = 'block';
    valvesDisplay.style.display = 'none';
    slideDisplay.style.display = 'flex';
  } else {
    valveKeybinds.style.display = 'block';
    slideKeybinds.style.display = 'none';
    valvesDisplay.style.display = 'flex';
    slideDisplay.style.display = 'none';
    
    if (currentInstrument === 'french_horn') {
      thumbKeybindGroup.style.display = 'flex';
      valveElements.t.style.display = 'flex';
    } else {
      thumbKeybindGroup.style.display = 'none';
      valveElements.t.style.display = 'none';
      activeValves.t = false;
      valveElements.t.classList.remove('pressed');
    }
  }
  
  populateSelect();
  if (currentInstrument === 'trombone') {
    setTargetNote("F3");
  } else if (currentInstrument === 'tuba') {
    setTargetNote("Bb1");
  } else {
    setTargetNote("C4");
  }
  stopNote();
});

targetNoteSelect.addEventListener('change', (e) => {
  setTargetNote(e.target.value);
});

nextNoteBtn.addEventListener('click', () => {
  const notes = Object.keys(FINGERINGS[currentInstrument]);
  const randomNote = notes[Math.floor(Math.random() * notes.length)];
  setTargetNote(randomNote);
});

function getPressedFingering() {
  if (currentInstrument === 'trombone') {
    return currentSlidePosition;
  }

  let pressed = [];
  if (activeValves['t'] && currentInstrument === 'french_horn') pressed.push("T");
  if (activeValves[1]) pressed.push("1");
  if (activeValves[2]) pressed.push("2");
  if (activeValves[3]) pressed.push("3");
  
  if (pressed.length === 0) return "0";
  return pressed.join("");
}

function checkFingering() {
  if (!isBlowing) {
    statusIndicator.innerText = "Hold SPACEBAR to Blow Air 💨";
    statusIndicator.className = "status-indicator";
    displayNote.style.color = "var(--text-primary)";
    simContainer.classList.remove("flash-success");
    stopNote();
    return;
  }

  const currentFingering = getPressedFingering();
  const validFingerings = FINGERINGS[currentInstrument][currentTargetNote];
  
  if (validFingerings.includes(currentFingering)) {
    // Success!
    statusIndicator.innerText = "✅ Correct!";
    statusIndicator.className = "status-indicator success";
    simContainer.classList.remove("flash-success");
    // Trigger reflow to restart animation
    void simContainer.offsetWidth; 
    simContainer.classList.add("flash-success");
    displayNote.style.color = "var(--success)";
    playNote(currentTargetNote);
  } else {
    // Incorrect
    const label = currentInstrument === 'trombone' ? `Position: ${currentFingering}` : `Fingering: ${currentFingering === "0" ? "Open" : currentFingering}`;
    statusIndicator.innerText = label;
    statusIndicator.className = "status-indicator";
    displayNote.style.color = "var(--text-primary)";
    stopNote();
  }
}

// Global Key Listeners
window.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  
  if (e.code === 'Space') {
    e.preventDefault();
    if (!isBlowing) {
      isBlowing = true;
      checkFingering();
    }
  }
  
  const key = e.key.toLowerCase();
  let changed = false;
  
  if (currentInstrument === 'trombone') {
    if (['1','2','3','4','5','6','7'].includes(key)) {
      if (currentSlidePosition !== key) {
        currentSlidePosition = key;
        slidePositionLabel.innerText = key;
        changed = true;
      }
    }
  } else {
    if (key === keybindings.t && !activeValves['t'] && currentInstrument === 'french_horn') {
      activeValves['t'] = true;
      valveElements['t'].classList.add('pressed');
      changed = true;
    }
    if (key === keybindings.v1 && !activeValves[1]) {
      activeValves[1] = true;
      valveElements[1].classList.add('pressed');
      changed = true;
    }
    if (key === keybindings.v2 && !activeValves[2]) {
      activeValves[2] = true;
      valveElements[2].classList.add('pressed');
      changed = true;
    }
    if (key === keybindings.v3 && !activeValves[3]) {
      activeValves[3] = true;
      valveElements[3].classList.add('pressed');
      changed = true;
    }
  }
  
  if (changed) {
    checkFingering();
  }
});

window.addEventListener('keyup', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;

  if (e.code === 'Space' && isBlowing) {
    isBlowing = false;
    checkFingering();
  }

  const key = e.key.toLowerCase();
  let changed = false;
  
  if (currentInstrument !== 'trombone') {
    if (key === keybindings.t && activeValves['t'] && currentInstrument === 'french_horn') {
      activeValves['t'] = false;
      valveElements['t'].classList.remove('pressed');
      changed = true;
    }
    if (key === keybindings.v1 && activeValves[1]) {
      activeValves[1] = false;
      valveElements[1].classList.remove('pressed');
      changed = true;
    }
    if (key === keybindings.v2 && activeValves[2]) {
      activeValves[2] = false;
      valveElements[2].classList.remove('pressed');
      changed = true;
    }
    if (key === keybindings.v3 && activeValves[3]) {
      activeValves[3] = false;
      valveElements[3].classList.remove('pressed');
      changed = true;
    }
  }
  
  if (changed) {
    checkFingering();
  }
});

// Initialize
populateSelect();
setTargetNote("C4");
