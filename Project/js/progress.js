/* ====================================================
   progress.js — Practice History & Stats
==================================================== */

function getSessions() {
  return JSON.parse(localStorage.getItem('bt_sessions') || '[]');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function formatDur(sec) {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 && s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTotalTime(sec) {
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)}h`;
  if (sec >= 60)   return `${Math.floor(sec / 60)}m`;
  return `${sec}s`;
}

function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const days = [...new Set(sessions.map(s => s.date.slice(0, 10)))].sort().reverse();
  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    const d1 = new Date(days[i]);
    const d2 = new Date(days[i + 1]);
    const diff = (d1 - d2) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  // only count streak if today or yesterday is included
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== yesterday) return 0;
  return streak;
}

function topExercise(sessions) {
  if (!sessions.length) return '—';
  const counts = {};
  sessions.forEach(s => {
    counts[s.exercise] = (counts[s.exercise] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0].split(' ').slice(0, 2).join(' ');
}

function renderStats(sessions) {
  const total = sessions.reduce((a, s) => a + s.seconds, 0);
  document.getElementById('statTotalTime').textContent = formatTotalTime(total);
  document.getElementById('statSessions').textContent  = sessions.length;
  document.getElementById('statStreak').textContent    = calcStreak(sessions);
  document.getElementById('statFavorite').textContent  = topExercise(sessions);
}

function renderLog(sessions) {
  const container = document.getElementById('logContainer');
  if (!sessions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎺</div>
        <p>No sessions logged yet.<br/>Head to <a href="practice.html" style="color:var(--accent);">Practice</a> to start!</p>
      </div>`;
    return;
  }
  container.innerHTML = '<div class="log-list">' +
    sessions.map((s, i) => {
      const date = new Date(s.date);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="log-item">
          <div>
            <div class="log-exercise">${s.exercise}</div>
            <div class="log-date">${dateStr} · ${timeStr}</div>
          </div>
          <div class="log-duration">${formatDur(s.seconds)}</div>
        </div>`;
    }).join('') + '</div>';
}

function clearLog() {
  if (!confirm('Clear all session history? This cannot be undone.')) return;
  localStorage.removeItem('bt_sessions');
  renderAll();
  showToast('🗑 Session history cleared.');
}

function renderAll() {
  const sessions = getSessions();
  renderStats(sessions);
  renderLog(sessions);
}

document.addEventListener('DOMContentLoaded', renderAll);
