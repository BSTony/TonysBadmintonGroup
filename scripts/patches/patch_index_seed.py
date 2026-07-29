import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add seed to initial state
target_initial = r"    round: 1"
replacement_initial = r"    round: 1,\n    seed: Math.floor(Math.random() * 1000000)"
content = content.replace(target_initial, replacement_initial)

# Add seed regeneration on next-round
target_next = r"    pinballRoom.status = 'instruction';"
replacement_next = r"    pinballRoom.status = 'instruction';\n    pinballRoom.seed = Math.floor(Math.random() * 1000000);"
content = content.replace(target_next, replacement_next)

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added seed to index.js")
