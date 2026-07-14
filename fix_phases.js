const fs = require('fs');

// 1. Fix backend (index.js)
let backendCode = fs.readFileSync('index.js', 'utf8');

const oldStartSeq = `app.post('/api/admin/pinball/start-sequence', express.json(), (req, res) => {
  const { uid, winnerLimit } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  pinballRoom.winnerLimit = winnerLimit || 3;
  pinballRoom.status = 'item_selection';
  pinballRoom.itemChoices = {};
  pinballRoom.traps = [];
  io.emit('pinball_state', pinballRoom);
  
  // Sequence timers
  setTimeout(() => {
    if (pinballRoom.status !== 'item_selection') return; // Cancelled
    pinballRoom.status = 'item_placement';
    io.emit('pinball_state', pinballRoom);
    
    setTimeout(() => {
      if (pinballRoom.status !== 'item_placement') return; // Cancelled
      pinballRoom.status = 'playing';
      io.emit('pinball_state', pinballRoom);
    }, 10000);
  }, 10000);
  
  res.json({ success: true, pinballRoom });
});`;

const newStartSeq = `app.post('/api/admin/pinball/start-sequence', express.json(), (req, res) => {
  const { uid, winnerLimit } = req.body;
  if (!uid || !isSuperAdmin(uid)) return res.status(403).json({ error: 'Permission denied' });
  
  pinballRoom.winnerLimit = winnerLimit || 3;
  pinballRoom.status = 'item_placement';
  pinballRoom.itemChoices = {};
  pinballRoom.traps = [];
  io.emit('pinball_state', pinballRoom);
  
  // Sequence timers
  setTimeout(() => {
    if (pinballRoom.status !== 'item_placement') return; // Cancelled
    pinballRoom.status = 'playing';
    io.emit('pinball_state', pinballRoom);
  }, 15000);
  
  res.json({ success: true, pinballRoom });
});`;

backendCode = backendCode.replace(oldStartSeq, newStartSeq);
backendCode = backendCode.replace(
  "if (pinballRoom.status !== 'item_selection') return res.status(400).json({ error: 'Not in selection phase' });",
  "if (pinballRoom.status !== 'item_placement') return res.status(400).json({ error: 'Not in placement phase' });"
);

fs.writeFileSync('index.js', backendCode);
console.log('Backend fixed.');

// 2. Fix frontend (pinball.js)
let frontendCode = fs.readFileSync('public/pinball.js', 'utf8');

// selectItem function update
const oldSelectItemStart = `function selectItem(type, btnObj) {
  if (pbState.status !== 'item_selection') return;`;
const newSelectItemStart = `function selectItem(type, btnObj) {
  if (pbState.status !== 'item_placement') return;`;

frontendCode = frontendCode.replace(oldSelectItemStart, newSelectItemStart);

// add hide logic
const oldFetchEnd = `  }).catch(console.error);
}`;
const newFetchEnd = `  }).then(() => {
    if (pinballItemSelectionUi) pinballItemSelectionUi.classList.add('hidden');
  }).catch(console.error);
}`;
frontendCode = frontendCode.replace(oldFetchEnd, newFetchEnd);

// state.status === 'item_placement' update
const oldPlacementPhase = `    } else if (state.status === 'item_placement') {
      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
      
      if (pinballStatusOverlay && pinballStatusText && pinballStatusTimer) {
        pinballStatusOverlay.classList.remove('hidden');
        pinballStatusText.innerText = '點擊畫面佈置道具！';
        let timeLeft = 10;
        pinballStatusTimer.innerText = timeLeft;
        if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
        window.pinballTimerInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft >= 0) pinballStatusTimer.innerText = timeLeft;
        }, 1000);
      }
      
      updatePinballTraps(state.traps);`;

const newPlacementPhase = `    } else if (state.status === 'item_placement') {
      if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
      if (roomParticipantsPanel) roomParticipantsPanel.classList.add('hidden');
      if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
      
      if (pinballItemSelectionUi) {
        const hasChosen = selectedItemType || (typeof currentUser !== 'undefined' && pbState.itemChoices[currentUser?.userId]);
        if (!hasChosen) {
           pinballItemSelectionUi.classList.remove('hidden');
        } else {
           pinballItemSelectionUi.classList.add('hidden');
        }
      }
      
      if (pinballStatusOverlay && pinballStatusText && pinballStatusTimer) {
        pinballStatusOverlay.classList.remove('hidden');
        pinballStatusText.innerText = '選擇並佈置道具！';
        let timeLeft = 15;
        pinballStatusTimer.innerText = timeLeft;
        if (window.pinballTimerInterval) clearInterval(window.pinballTimerInterval);
        window.pinballTimerInterval = setInterval(() => {
          timeLeft--;
          if (timeLeft >= 0) pinballStatusTimer.innerText = timeLeft;
        }, 1000);
      }
      
      updatePinballTraps(state.traps);`;

frontendCode = frontendCode.replace(oldPlacementPhase, newPlacementPhase);

fs.writeFileSync('public/pinball.js', frontendCode);
console.log('Frontend fixed.');
