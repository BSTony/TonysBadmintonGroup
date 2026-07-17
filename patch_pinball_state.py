import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"pbState = state;"
replacement = r"pbState = state;\n      if (state.seed) setSeed(state.seed);"

content = content.replace(target, replacement)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched state listener to set seed")
