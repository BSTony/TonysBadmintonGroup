import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update lobby panel display logic
target_lobby_panel = "if (roomParticipantsPanel) roomParticipantsPanel.style.display = '';"
replacement_lobby_panel = "if (roomParticipantsPanel) { if (!hasSelectedPinballColor) { roomParticipantsPanel.style.display = ''; } }"
content = content.replace(target_lobby_panel, replacement_lobby_panel)

# 2. Update join button text to '修改顏色' for existing players
target_join = """          if (myName && !state.pool.includes(myName)) {
             pinballSpectatorUi.classList.add('hidden');
             if (btnJoinPinball) {
               btnJoinPinball.classList.remove('hidden');
               btnJoinPinball.onclick = () => {
                 if (window.pinballSocket) { window.pinballSocket.emit('join_pinball', { name: myName }); } else { alert('Socket not found!'); }
               };
             }
          } else {
             pinballSpectatorUi.classList.remove('hidden');
             pinballSpectatorUi.innerText = '等待遊戲開始...';
             if (btnJoinPinball) btnJoinPinball.classList.add('hidden');
          }"""

replacement_join = """          if (myName) {
            if (!state.pool.includes(myName)) {
               pinballSpectatorUi.classList.add('hidden');
               if (btnJoinPinball) {
                 btnJoinPinball.classList.remove('hidden');
                 btnJoinPinball.innerText = '🙋‍♂️ 報名參加';
                 btnJoinPinball.onclick = () => {
                   if (window.pinballSocket) { window.pinballSocket.emit('join_pinball', { name: myName }); } else { alert('Socket not found!'); }
                 };
               }
            } else {
               pinballSpectatorUi.classList.remove('hidden');
               pinballSpectatorUi.innerText = '等待遊戲開始...';
               if (btnJoinPinball) {
                 btnJoinPinball.classList.remove('hidden');
                 btnJoinPinball.innerText = '🎨 修改顏色';
                 btnJoinPinball.onclick = () => {
                   hasSelectedPinballColor = false;
                   const colorUi = document.getElementById('pinball-color-picker-ui');
                   if (colorUi) colorUi.classList.remove('hidden');
                 };
               }
            }
          }"""

content = content.replace(target_join, replacement_join)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("pinball.js patched for modify color")
