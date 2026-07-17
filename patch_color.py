import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add hasSelectedPinballColor declaration if not exists
if "let hasSelectedPinballColor = false;" not in content:
    content = content.replace("let pbRunner = null;", "let pbRunner = null;\nlet hasSelectedPinballColor = false;")

# Reset it on idle
target_idle = "if (state.status === 'idle') window.pinballRaceStarted = false;"
if target_idle in content:
    content = content.replace(target_idle, "if (state.status === 'idle') { window.pinballRaceStarted = false; hasSelectedPinballColor = false; }")

# Update colorUi visibility logic
target_color_ui = """        if (colorUi && myName && state.pool.includes(myName)) {
          colorUi.classList.remove('hidden');"""
replacement_color_ui = """        if (colorUi && myName && state.pool.includes(myName)) {
          if (!hasSelectedPinballColor) {
            colorUi.classList.remove('hidden');
          } else {
            colorUi.classList.add('hidden');
          }"""
content = content.replace(target_color_ui, replacement_color_ui)

# Update onClick
target_click = """              btn.onclick = () => {
                fetch('/api/pinball/set-color', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: myName, color: c })
                });
                // Visual feedback
                Array.from(colorContainer.children).forEach(child => child.style.transform = 'scale(1)');
                btn.style.transform = 'scale(1.2)';
              };"""

replacement_click = """              btn.onclick = () => {
                fetch('/api/pinball/set-color', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: myName, color: c })
                });
                hasSelectedPinballColor = true;
                if (colorUi) colorUi.classList.add('hidden');
              };"""

content = content.replace(target_click, replacement_click)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("pinball.js color picker logic patched")
