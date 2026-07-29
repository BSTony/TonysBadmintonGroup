const fs = require('fs');

// 1. Fix index.html: remove class="hidden" from room-participants-panel
let indexHtml = fs.readFileSync('public/index.html', 'utf8');
indexHtml = indexHtml.replace('<div id="room-participants-panel" class="hidden"', '<div id="room-participants-panel"');
fs.writeFileSync('public/index.html', indexHtml, 'utf8');

// 2. Update app.js for button event listeners
let appJs = fs.readFileSync('public/app.js', 'utf8');

if (!appJs.includes('btnShowParticipants')) {
  const listenerCode = `
const btnShowParticipants = document.getElementById('btn-show-participants');
const btnCloseParticipants = document.getElementById('btn-close-participants');

if (btnShowParticipants && participantsPanel) {
  btnShowParticipants.addEventListener('click', () => {
    participantsPanel.classList.toggle('hidden');
  });
}

if (btnCloseParticipants && participantsPanel) {
  btnCloseParticipants.addEventListener('click', () => {
    participantsPanel.classList.add('hidden');
  });
}
`;

  appJs = appJs.replace(
    /const panelParticipantsContent = document\.getElementById\('panel-participants-content'\);\r?\nconst panelWinnersContent = document\.getElementById\('panel-winners-content'\);/,
    "const panelParticipantsContent = document.getElementById('panel-participants-content');\nconst panelWinnersContent = document.getElementById('panel-winners-content');\n" + listenerCode
  );
}

fs.writeFileSync('public/app.js', appJs, 'utf8');
