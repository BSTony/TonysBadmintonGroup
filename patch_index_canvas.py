import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = """            <div id="pinball-color-options" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; justify-items: center; margin-bottom: 10px;">"""

replacement = """            <canvas id="pinball-preview-canvas" width="100" height="100" style="margin: 0 auto 10px auto; display: none;"></canvas>

            <div id="pinball-color-options" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; justify-items: center; margin-bottom: 10px;">"""

if target in content:
    content = content.replace(target, replacement)
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("index.html patched with preview canvas")
else:
    print("target not found")
