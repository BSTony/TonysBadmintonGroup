import re
with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""      if (state.status !== 'lobby') {
        if (roomAdminPanel) roomAdminPanel.style.display = 'none';
        if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
      }"""

replacement = r"""      if (state.status !== 'lobby') {
        if (roomAdminPanel) roomAdminPanel.style.display = 'none';
        if (roomParticipantsPanel) roomParticipantsPanel.style.display = 'none';
        const btnJoinPinball = document.getElementById('btn-join-pinball');
        if (btnJoinPinball) btnJoinPinball.classList.add('hidden');
      }"""

content_normalized = re.sub(r'\r\n', '\n', content)
if target in content_normalized:
    content_normalized = content_normalized.replace(target, replacement)
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content_normalized)
    print("Patched hidden btn-join-pinball")
else:
    print("Target not found for hiding btn")
