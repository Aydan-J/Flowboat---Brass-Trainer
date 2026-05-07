// js/theme.js
// Handles Light/Dark mode toggle and persistence

document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  
  // Create theme toggle container if it doesn't exist
  let themeContainer = document.querySelector('.theme-toggle-container');
  if (!themeContainer) {
    themeContainer = document.createElement('div');
    themeContainer.className = 'theme-toggle-container';
    body.appendChild(themeContainer);
  }
  
  // Create toggle button
  themeContainer.innerHTML = `
    <button id="themeToggle" title="Toggle Light/Dark Mode">
      <span id="themeIcon">🌙</span>
    </button>
  `;
  
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');

  // Load saved theme
  const savedTheme = localStorage.getItem('valvetrainer_theme');
  if (savedTheme === 'light') {
    body.classList.add('light-mode');
    themeIcon.innerText = '☀️';
  }

  themeToggle.addEventListener('click', () => {
    body.classList.toggle('light-mode');
    const isLight = body.classList.contains('light-mode');
    themeIcon.innerText = isLight ? '☀️' : '🌙';
    localStorage.setItem('valvetrainer_theme', isLight ? 'light' : 'dark');
  });
});
