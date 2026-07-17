import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = "colorUi.style.bottom = '150px';"
replacement = "// colorUi.style.bottom = '150px';"

if target in content:
    content = content.replace(target, replacement)
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("pinball.js patched")
else:
    print("target not found in pinball.js")
