import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

target_click = """              btn.onclick = () => {
                fetch('/api/pinball/set-color', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: myName, color: c })
                });
                hasSelectedPinballColor = true;
                if (colorUi) colorUi.classList.add('hidden');
              };"""

replacement_click = """              let selectedColor = null;
              btn.onclick = () => {
                selectedColor = c;
                // Visual feedback
                Array.from(colorContainer.children).forEach(child => child.style.transform = 'scale(1)');
                btn.style.transform = 'scale(1.2)';
                
                const confirmBtn = document.getElementById('btn-pinball-color-confirm');
                if (confirmBtn) {
                   confirmBtn.style.display = 'block';
                   confirmBtn.onclick = () => {
                     fetch('/api/pinball/set-color', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ name: myName, color: selectedColor })
                     });
                     hasSelectedPinballColor = true;
                     if (colorUi) colorUi.classList.add('hidden');
                   };
                }
              };"""

content = content.replace(target_click, replacement_click)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("pinball.js patched for confirm button")
