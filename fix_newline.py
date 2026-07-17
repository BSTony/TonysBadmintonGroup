import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("pbState = state;\\n      if (state.seed) setSeed(state.seed);", "pbState = state;\n      if (state.seed) setSeed(state.seed);")

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed newline")
