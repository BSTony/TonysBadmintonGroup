import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'\s*<button id="btn-pinball-admin-sync".*?</button>\s*', '\n', content)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed sync button using regex")
