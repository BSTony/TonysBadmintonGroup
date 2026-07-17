import re

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Inject updatePreview into the color button click handler
target = """              btn.onclick = () => {
                selectedColor = c;
                // Visual feedback"""
replacement = """              btn.onclick = () => {
                selectedColor = c;
                updatePreview();
                // Visual feedback"""
if target in content:
    content = content.replace(target, replacement)
    print("Injected updatePreview into color button click")

# 2. Set default selectedColor to player's current color, or the first default color, and render it immediately
target2 = """          const defaultColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6', '#fd79a8', '#00cec9'];"""
replacement2 = """          const defaultColors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6', '#fd79a8', '#00cec9'];
          
          // Initial preview setup
          if (!selectedColor) {
             const myName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.displayName : null;
             if (myName && pbBalls && pbBalls[myName]) {
               selectedColor = pbBalls[myName].render.fillStyle;
               selectedStyle = pbBalls[myName].plugin.style || 'solid';
             } else {
               selectedColor = defaultColors[0];
               selectedStyle = 'solid';
             }
             
             // visually select the style button
             styleBtns.forEach(b => {
               if (b.getAttribute('data-style') === selectedStyle) {
                 b.style.borderColor = '#3498db';
                 b.classList.add('active');
               }
             });
             
             updatePreview();
          }"""
if target2 in content:
    content = content.replace(target2, replacement2)
    print("Injected initial preview render")

with open('public/pinball.js', 'w', encoding='utf-8') as f:
    f.write(content)

