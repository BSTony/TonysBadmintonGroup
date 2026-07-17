import re
import sys

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update style logic inside color options init
target_init_colors = """        if (colorContainer && colorContainer.children.length === 0) {
          let selectedColor = null;"""
replacement_init_colors = """        if (colorContainer && colorContainer.children.length === 0) {
          let selectedColor = null;
          let selectedStyle = 'solid';
          
          const styleBtns = document.querySelectorAll('.pinball-style-btn');
          styleBtns.forEach(btn => {
            btn.onclick = () => {
              styleBtns.forEach(b => b.style.borderColor = 'transparent');
              btn.style.borderColor = '#3498db';
              selectedStyle = btn.getAttribute('data-style');
            };
          });
"""
if target_init_colors in content:
    content = content.replace(target_init_colors, replacement_init_colors)

# 2. Update fetch payload
target_fetch = """                   fetch('/api/pinball/set-color', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ name: myName, color: selectedColor })
                   });"""
replacement_fetch = """                   fetch('/api/pinball/set-color', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ name: myName, color: selectedColor, style: selectedStyle })
                   });"""
if target_fetch in content:
    content = content.replace(target_fetch, replacement_fetch)

# 3. Update syncBalls (add style to plugin)
target_syncballs = """        pbBalls[name] = ball;
        World.add(pbEngine.world, ball);
      } else {
        // Update color dynamically if user picks a new one in lobby
        pbBalls[name].render.fillStyle = color;
      }
    });"""
replacement_syncballs = """        pbBalls[name] = ball;
        ball.plugin.style = (state.styles && state.styles[name]) ? state.styles[name] : 'solid';
        ball.render.visible = false;
        World.add(pbEngine.world, ball);
      } else {
        // Update color and style dynamically if user picks a new one in lobby
        pbBalls[name].render.fillStyle = color;
        pbBalls[name].plugin.style = (state.styles && state.styles[name]) ? state.styles[name] : 'solid';
        pbBalls[name].render.visible = false;
      }
    });"""
if target_syncballs in content:
    content = content.replace(target_syncballs, replacement_syncballs)

# 4. Update afterRender drawing logic
# Find where Custom Billiard Balls is
start_marker = "// 4. Custom Billiard Balls"
end_marker = "// Inner white circle for number"

# Wait, let's just search and replace the drawing part directly.
# Let's read the exact lines from public/pinball.js first.
