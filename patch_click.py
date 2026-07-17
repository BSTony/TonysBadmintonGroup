import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r"selectedColor = c;\s*// Visual feedback", r"selectedColor = c;\n                updatePreview();\n                // Visual feedback", content)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
