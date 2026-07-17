import sys
import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"if \(dynBoard\) dynBoard\.classList\.remove\('hidden'\);"
replacement = r"""if (dynBoard) dynBoard.classList.remove('hidden');

        if (pinballSpectatorUi) pinballSpectatorUi.classList.add('hidden');
        const btnJoinPinball = document.getElementById('btn-join-pinball');
        if (btnJoinPinball) btnJoinPinball.classList.add('hidden');"""

content = re.sub(target, replacement, content, count=1)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("pinball.js patched to hide buttons")
