import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""        if (pinballSpectatorUi) {
          pinballSpectatorUi.classList.remove('hidden');
          pinballSpectatorUi.innerText = '等?戲??...';
        }"""

replacement = r"""        if (pinballSpectatorUi) {
          const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
          const btnJoinPinball = document.getElementById('btn-join-pinball');
          if (myName && !state.pool.includes(myName)) {
             pinballSpectatorUi.classList.add('hidden');
             if (btnJoinPinball) {
               btnJoinPinball.classList.remove('hidden');
               btnJoinPinball.onclick = () => {
                 if (typeof pinballSocket !== 'undefined') pinballSocket.emit('join_pinball', { name: myName });
               };
             }
          } else {
             pinballSpectatorUi.classList.remove('hidden');
             pinballSpectatorUi.innerText = '等待遊戲開始...';
             if (btnJoinPinball) btnJoinPinball.classList.add('hidden');
          }
        }"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_norm = re.sub(r'\r\n', '\n', target)

# Regex to avoid encoding issues with "等?戲??..."
pattern = re.compile(r"if \(pinballSpectatorUi\) \{\s*pinballSpectatorUi\.classList\.remove\('hidden'\);\s*pinballSpectatorUi\.innerText = '[^']+';\s*\}")

new_content = pattern.sub(replacement, content_normalized)

if new_content != content_normalized:
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Frontend patched (pinball.js)")
else:
    print("Frontend target not found in pinball.js")
