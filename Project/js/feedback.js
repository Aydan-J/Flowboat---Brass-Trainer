/* ====================================================
   feedback.js — Practice Notes / Feedback
==================================================== */

const EXERCISES = [
  'Long Tones', 'Lip Slurs', 'Major Scales', 'Chromatic Scale',
  'Articulation Patterns', 'Flexibility Studies', 'Sight Reading',
  'Lyrical Hymns', 'General Practice',
];

const RATINGS = ['😓 Rough', '😐 Okay', '🙂 Good', '😄 Great', '🔥 Excellent'];

let selectedRating = 0;

function getNotes() {
  return JSON.parse(localStorage.getItem('bt_notes') || '[]');
}
function saveNotes(arr) {
  localStorage.setItem('bt_notes', JSON.stringify(arr));
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- Populate exercise dropdown ----
function populateSelect() {
  const sel = document.getElementById('noteExercise');
  EXERCISES.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex;
    opt.textContent = ex;
    sel.appendChild(opt);
  });
}

// ---- Rating buttons ----
function setRating(val) {
  selectedRating = val;
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.r) === val);
  });
}

// ---- Save note ----
function saveNote() {
  const exercise = document.getElementById('noteExercise').value;
  const text     = document.getElementById('noteText').value.trim();
  if (!text) {
    showToast('⚠️ Please write something before saving!');
    return;
  }
  const notes = getNotes();
  notes.unshift({
    id:       Date.now(),
    date:     new Date().toISOString(),
    exercise,
    rating:   selectedRating,
    text,
  });
  saveNotes(notes);
  document.getElementById('noteText').value = '';
  selectedRating = 0;
  document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected'));
  renderNotes();
  showToast('✅ Note saved!');
}

// ---- Delete note ----
function deleteNote(id) {
  const notes = getNotes().filter(n => n.id !== id);
  saveNotes(notes);
  renderNotes();
}

// ---- Clear all ----
function clearNotes() {
  if (!confirm('Delete all notes? This cannot be undone.')) return;
  localStorage.removeItem('bt_notes');
  renderNotes();
  showToast('🗑 All notes cleared.');
}

// ---- Render ----
function renderNotes() {
  const notes = getNotes();
  const container = document.getElementById('notesContainer');
  if (!notes.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No notes yet. Write your first reflection!</p>
      </div>`;
    return;
  }
  container.innerHTML = '<div class="notes-card-list">' +
    notes.map(n => {
      const date    = new Date(n.date);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const ratingStr = n.rating ? RATINGS[n.rating - 1] : '';
      return `
        <div class="note-card">
          <div class="note-header">
            <div class="note-exercise">${n.exercise}</div>
            <button class="note-delete" onclick="deleteNote(${n.id})" title="Delete">✕</button>
          </div>
          ${ratingStr ? `<div class="note-rating">${ratingStr}</div>` : ''}
          <div class="note-text">${escapeHtml(n.text)}</div>
          <div class="note-date" style="margin-top:0.5rem;font-size:0.72rem;color:var(--text-muted);">${dateStr}</div>
        </div>`;
    }).join('') + '</div>';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  populateSelect();
  renderNotes();
});
