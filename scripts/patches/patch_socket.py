import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""function bindPinballSocket(s) {
    s.on('pinball_ball_moved', (data) => {"""

replacement = r"""function bindPinballSocket(s) {
    window.pinballSocket = s;
    s.on('pinball_ball_moved', (data) => {"""

if target in content:
    content = content.replace(target, replacement)
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("pinball.js patched for pinballSocket")
else:
    print("pinball.js target not found")
