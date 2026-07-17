import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's see what is inside btnPinballAdminSync
sync_match = re.search(r'btnPinballAdminSync\.addEventListener(.*?)\}\);', content, re.DOTALL)
if sync_match:
    print("btnPinballAdminSync logic:")
    print(sync_match.group(0))

import_match = re.search(r'btnImportLobbyUsers\.addEventListener(.*?)\}\);', content, re.DOTALL)
if import_match:
    print("\nbtnImportLobbyUsers logic:")
    print(import_match.group(0))
