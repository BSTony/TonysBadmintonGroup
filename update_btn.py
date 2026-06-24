import sys

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace button text
old_btn = """      <div class="card-actions">
        ${isMeRegistered 
          ? `<button class="btn-danger" onclick="handleAction('${game.gameId}', 'cancel')">➖ 取消報名</button>`
          : `<button class="btn-primary" onclick="handleAction('${game.gameId}', 'register')">➕ 本人報名</button>`
        }
      </div>"""

new_btn = """      <div class="card-actions">
        ${isMeRegistered 
          ? `<button class="btn-danger" onclick="handleAction('${game.gameId}', 'cancel')">-1</button>`
          : `<button class="btn-primary" onclick="handleAction('${game.gameId}', 'register')">+1</button>`
        }
      </div>"""

if old_btn in content:
    content = content.replace(old_btn, new_btn)
    with open('public/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated public/app.js button text")
else:
    print("Could not find button text logic")
