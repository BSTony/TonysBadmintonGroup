import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# find any variables that look like a list of names for a lobby
matches = re.findall(r'let \w+Names = \[\];|let \w+Pool = \[\];', content)
print(set(matches))
