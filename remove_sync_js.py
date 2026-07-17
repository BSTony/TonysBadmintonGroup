import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target_block = """  if (btnPinballAdminSync) {
    btnPinballAdminSync.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/admin/pinball/sync-pool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.userId, pool: partyLobbyNames })
        });
        const data = await res.json();
        if (!data.success) alert(data.error);
      } catch(e) { console.error(e); }
    });
  }"""

if target_block in content:
    content = content.replace(target_block, '')
    with open('public/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Removed sync logic from app.js")
else:
    print("Target block not found in app.js")
