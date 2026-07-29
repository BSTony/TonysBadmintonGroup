import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = r'<button id="btn-pinball-admin-sync" class="btn-secondary" style="width: 100%; font-size:12px; margin-bottom: 5px;">同步大廳名單至賽道</button>'
content = content.replace(target, '')

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed sync button from index.html")
