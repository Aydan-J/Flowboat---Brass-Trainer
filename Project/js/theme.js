// js/theme.js
// Handles Light/Dark mode toggle and persistence

document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const navLinks = document.querySelector('.nav-links');
  
  // Create toggle button
  const toggleBtn = document.createElement('li');
  toggleBtn.innerHTML = `
    <button id="themeToggle" class="nav-link" style="background:none; border:none; cursor:pointer; color:inherit; font-size: 1.2rem; display:flex; align-items:center; justify-content:center; padding: 7px 15px;">
      <span id="themeIcon">🌙</span>
    </button>
  `;
  
  if (navLinks) {
    navLinks.appendChild(toggleBtn);
  }

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
