// js/games.js
// 1-Minute Drill Game Logic

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

// --- State ---
let currentInstrument = "trumpet";
let gameDuration = 60; // seconds
let timeRemaining = 0;
let timerInterval = null;

let correctCount = 0;
let wrongCount = 0;
let missedNotes = new Set();

let currentNote = "";
let isBlowing = false;
let currentSlidePosition = "1";
let drillDifficultyValue = "easy";

let keybindings = { t: 'a', v1: 'j', v2: 'k', v3: 'l' };
let activeValves = { t: false, 1: false, 2: false, 3: false };

// Audio Context for UI sounds
let audioCtx = null;

// --- DOM Elements ---
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const resultsScreen = document.getElementById('resultsScreen');

const drillInstrument = document.getElementById('drillInstrument');
const drillTime = document.getElementById('drillTime');
const drillDifficulty = document.getElementById('drillDifficulty');
const startBtn = document.getElementById('startBtn');
const playAgainBtn = document.getElementById('playAgainBtn');

const timerDisplay = document.getElementById('timerDisplay');
const scoreCorrectEl = document.getElementById('scoreCorrect');
const scoreWrongEl = document.getElementById('scoreWrong');
const targetNoteEl = document.getElementById('targetNote');
const staffDisplayContainer = document.getElementById('staffDisplayContainer');
const staffDisplay = document.getElementById('staffDisplay');
const gameMsg = document.getElementById('gameMsg');

const finalCorrect = document.getElementById('finalCorrect');
const finalWrong = document.getElementById('finalWrong');
const missedNotesContainer = document.getElementById('missedNotesContainer');
const missedList = document.getElementById('missedList');

const bindT = document.getElementById('bindT');
const bindV1 = document.getElementById('bindV1');
const bindV2 = document.getElementById('bindV2');
const bindV3 = document.getElementById('bindV3');
const thumbKeybindGroup = document.getElementById('thumbKeybindGroup');
const valveKeybinds = document.getElementById('valveKeybinds');
const slideKeybinds = document.getElementById('slideKeybinds');

// --- Audio Sounds ---
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
}

function playDing() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
}

function playBuzzer() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

// --- Setup ---
drillInstrument.addEventListener('change', (e) => {
  currentInstrument = e.target.value;
  if (currentInstrument === 'trombone') {
    valveKeybinds.style.display = 'none';
    slideKeybinds.style.display = 'block';
  } else {
    valveKeybinds.style.display = 'block';
    slideKeybinds.style.display = 'none';
    if (currentInstrument === 'french_horn') {
      thumbKeybindGroup.style.display = 'flex';
    } else {
      thumbKeybindGroup.style.display = 'none';
    }
  }
});

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

// --- Game Logic ---
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderSheetMusic(noteStr) {
  const VF = Vex.Flow;
  staffDisplay.innerHTML = "";
  
  const renderer = new VF.Renderer(staffDisplay, VF.Renderer.Backends.SVG);
  renderer.resize(140, 150);
  const context = renderer.getContext();
  
  const clef = (currentInstrument === 'trombone' || currentInstrument === 'tuba') ? 'bass' : 'treble';
  
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

function pickRandomNote() {
  const notes = Object.keys(FINGERINGS[currentInstrument]);
  let newNote;
  do {
    newNote = notes[Math.floor(Math.random() * notes.length)];
  } while (newNote === currentNote && notes.length > 1);
  currentNote = newNote;
  
  if (drillDifficultyValue === 'hard') {
    renderSheetMusic(currentNote);
  } else {
    targetNoteEl.innerText = currentNote;
  }
}

function startGame() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  currentInstrument = drillInstrument.value;
  gameDuration = parseInt(drillTime.value);
  drillDifficultyValue = drillDifficulty.value;
  timeRemaining = gameDuration;
  
  if (drillDifficultyValue === 'hard') {
    targetNoteEl.style.display = 'none';
    staffDisplayContainer.style.display = 'flex';
  } else {
    targetNoteEl.style.display = 'block';
    staffDisplayContainer.style.display = 'none';
  }
  
  correctCount = 0;
  wrongCount = 0;
  missedNotes.clear();
  
  scoreCorrectEl.innerText = correctCount;
  scoreWrongEl.innerText = wrongCount;
  timerDisplay.innerText = formatTime(timeRemaining);
  gameMsg.innerText = "Ready!";
  gameMsg.style.color = "var(--text-muted)";
  
  setupScreen.style.display = 'none';
  resultsScreen.style.display = 'none';
  gameScreen.style.display = 'block';
  
  pickRandomNote();
  
  timerInterval = setInterval(() => {
    timeRemaining--;
    timerDisplay.innerText = formatTime(timeRemaining);
    if (timeRemaining <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  clearInterval(timerInterval);
  
  gameScreen.style.display = 'none';
  resultsScreen.style.display = 'block';
  
  finalCorrect.innerText = correctCount;
  finalWrong.innerText = wrongCount;
  
  missedList.innerHTML = '';
  if (missedNotes.size > 0) {
    missedNotesContainer.style.display = 'block';
    missedNotes.forEach(note => {
      const span = document.createElement('span');
      span.className = 'missed-tag';
      span.innerText = note;
      missedList.appendChild(span);
    });
  } else {
    missedNotesContainer.style.display = 'none';
  }
}

startBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', () => {
  resultsScreen.style.display = 'none';
  setupScreen.style.display = 'block';
});

// --- Gameplay Input ---
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

function submitAnswer() {
  if (timeRemaining <= 0 || gameScreen.style.display === 'none') return;
  
  const currentFingering = getPressedFingering();
  const validFingerings = FINGERINGS[currentInstrument][currentNote];
  
  gameScreen.classList.remove("flash-success", "flash-error");
  void gameScreen.offsetWidth; // trigger reflow
  
  if (validFingerings.includes(currentFingering)) {
    // Correct
    correctCount++;
    scoreCorrectEl.innerText = correctCount;
    gameMsg.innerText = "✅ Correct!";
    gameMsg.style.color = "var(--success)";
    gameScreen.classList.add("flash-success");
    playDing();
  } else {
    // Wrong
    wrongCount++;
    scoreWrongEl.innerText = wrongCount;
    missedNotes.add(currentNote);
    gameMsg.innerText = "❌ Incorrect!";
    gameMsg.style.color = "#ef4444";
    gameScreen.classList.add("flash-error");
    playBuzzer();
  }
  
  // Immediately switch to next note
  pickRandomNote();
}

window.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  if (gameScreen.style.display === 'none') return;
  
  const key = e.key.toLowerCase();
  
  if (e.code === 'Space') {
    e.preventDefault();
    if (!isBlowing) {
      isBlowing = true;
      submitAnswer();
    }
  }
  
  if (currentInstrument === 'trombone') {
    if (['1','2','3','4','5','6','7'].includes(key)) {
      currentSlidePosition = key;
    }
  } else {
    if (key === keybindings.t) activeValves['t'] = true;
    if (key === keybindings.v1) activeValves[1] = true;
    if (key === keybindings.v2) activeValves[2] = true;
    if (key === keybindings.v3) activeValves[3] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  const key = e.key.toLowerCase();
  
  if (e.code === 'Space') {
    isBlowing = false;
  }
  
  if (currentInstrument !== 'trombone') {
    if (key === keybindings.t) activeValves['t'] = false;
    if (key === keybindings.v1) activeValves[1] = false;
    if (key === keybindings.v2) activeValves[2] = false;
    if (key === keybindings.v3) activeValves[3] = false;
  }
});
