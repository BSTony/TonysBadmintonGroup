import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = 'id="pinball-color-picker-ui" class="hidden" style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);'
replacement = 'id="pinball-color-picker-ui" class="hidden" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);'

if target in content:
    content = content.replace(target, replacement)
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("index.html patched")
else:
    print("target not found in index.html")
