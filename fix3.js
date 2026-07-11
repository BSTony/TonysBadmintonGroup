const fs = require('fs');

let c = fs.readFileSync('public/app.js', 'utf8');

const t1 = `  socket.on('player_joined', (p) => {
    if (!partyLobbyNames.includes(p.name)) {
      partyLobbyNames.push(p.name);
      updateAdminLobbyStatus();
    }
    createOtherPlayer(p);
  });
  
  socket.on('player_left', (p) => {
    partyLobbyNames = partyLobbyNames.filter(n => n !== p.name);
    updateAdminLobbyStatus();
    if (partyOthers[p.id]) {
      partyOthers[p.id].remove();
      delete partyOthers[p.id];
    }
  });`;

const r1 = `  socket.on('player_joined', (p) => {
    if (!partyLobbyNames.includes(p.name)) {
      partyLobbyNames.push(p.name);
      updateAdminLobbyStatus();
    }
    createOtherPlayer(p);
    
    // Update participant list immediately
    if (typeof roomPoolDisplayList !== 'undefined' && roomPoolDisplayList) {
      const existing = Array.from(roomPoolDisplayList.children).find(li => li.innerText === p.name);
      if (!existing) {
        const li = document.createElement('li');
        li.innerText = p.name;
        if (!p.alive) li.style.textDecoration = 'line-through';
        roomPoolDisplayList.appendChild(li);
      }
    }
  });
  
  socket.on('player_left', (p) => {
    partyLobbyNames = partyLobbyNames.filter(n => n !== p.name);
    updateAdminLobbyStatus();
    if (partyOthers[p.id]) {
      partyOthers[p.id].remove();
      delete partyOthers[p.id];
    }
    
    // Remove from participant list
    if (typeof roomPoolDisplayList !== 'undefined' && roomPoolDisplayList) {
      Array.from(roomPoolDisplayList.children).forEach(li => {
        if (li.innerText === p.name) li.remove();
      });
    }
  });`;

const t2 = `  socket.on('global_room_state', (state) => {
    window.globalRoomState = state;
    currentGlobalRoomState = state;
    updateUnifiedRoomUI();
  });`;

const r2 = `  socket.on('global_room_state', (state) => {
    window.globalRoomState = state;
    currentGlobalRoomState = state;
    updateUnifiedRoomUI();
    if (state.activeGame === 'survival' && typeof bhContainer !== 'undefined' && bhContainer) {
      bhContainer.classList.remove('hidden');
    }
  });`;

const t3 = `  socket.on('party_play', (data) => {
    bhIsPlaying = true;
    bhStartTime = performance.now(); // Ignore data.startTime to align with requestAnimationFrame's timestamp
    if (partyJoinContainer) partyJoinContainer.classList.add('hidden');
    if (btnJoinRoom) btnJoinRoom.classList.add('hidden');
    if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
    if (bhGameoverModal) bhGameoverModal.classList.add('hidden');`;

const r3 = `  socket.on('party_play', (data) => {
    bhIsPlaying = true;
    bhStartTime = performance.now(); // Ignore data.startTime to align with requestAnimationFrame's timestamp
    if (partyJoinContainer) partyJoinContainer.classList.add('hidden');
    if (btnJoinRoom) btnJoinRoom.classList.add('hidden');
    if (roomAdminPanel) roomAdminPanel.classList.add('hidden');
    if (bhGameoverModal) bhGameoverModal.classList.add('hidden');
    if (bhContainer) bhContainer.classList.remove('hidden');`;

c = c.replace(t1, r1);
c = c.replace(t2, r2);
c = c.replace(t3, r3);

fs.writeFileSync('public/app.js', c, 'utf8');
console.log('App patched.');
