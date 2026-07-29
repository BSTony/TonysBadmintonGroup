import re
import sys

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# I will add an updatePreview function and call it
target_init_colors = """        if (colorContainer && colorContainer.children.length === 0) {
          let selectedColor = null;
          let selectedStyle = 'solid';
          
          const styleBtns = document.querySelectorAll('.pinball-style-btn');"""

replacement_init_colors = """        if (colorContainer && colorContainer.children.length === 0) {
          let selectedColor = null;
          let selectedStyle = 'solid';
          
          function updatePreview() {
            const canvas = document.getElementById('pinball-preview-canvas');
            if (!canvas || !selectedColor) return;
            canvas.style.display = 'block';
            const ctx = canvas.getContext('2d');
            const r = 40;
            const cx = 50;
            const cy = 50;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw Ball
            ctx.save();
            ctx.translate(cx, cy);
            if (selectedStyle === 'solid') {
              ctx.fillStyle = selectedColor;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();
            } else if (selectedStyle === 'billiard') {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();
              
              ctx.fillStyle = selectedColor;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.clip();
              ctx.fillRect(-r, -r*0.5, r * 2, r);
            } else if (selectedStyle === 'gradient') {
              const grad = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.1, 0, 0, r);
              grad.addColorStop(0, '#ffffff');
              grad.addColorStop(0.3, selectedColor);
              grad.addColorStop(1, '#000000');
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            
            // Draw inner white circle
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw number
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 24px Arial';
            // Find player's number if possible, or just draw '?'
            let num = '?';
            const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
            if (myName && pbBalls && pbBalls[myName]) num = pbBalls[myName].plugin.num;
            ctx.fillText(num, cx, cy + 2);
          }
          
          const styleBtns = document.querySelectorAll('.pinball-style-btn');"""

if target_init_colors in content:
    content = content.replace(target_init_colors, replacement_init_colors)
else:
    print("Could not find init colors block")

# Now inject updatePreview() inside styleBtns click handler
target_stylebtn_click = """              selectedStyle = btn.getAttribute('data-style');
            };
          });"""
replacement_stylebtn_click = """              selectedStyle = btn.getAttribute('data-style');
              updatePreview();
            };
          });"""
if target_stylebtn_click in content:
    content = content.replace(target_stylebtn_click, replacement_stylebtn_click)

# Now inject updatePreview() inside color btn click handler
target_color_click = """                selectedColor = c;
                // Visual feedback"""
replacement_color_click = """                selectedColor = c;
                updatePreview();
                // Visual feedback"""
if target_color_click in content:
    content = content.replace(target_color_click, replacement_color_click)

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("pinball.js patched with preview canvas logic")
