import re
import sys

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add selectedStyle logic inside color options init
target_init_colors = """        if (colorContainer && colorContainer.children.length === 0) {
          let selectedColor = null;"""
replacement_init_colors = """        if (colorContainer && colorContainer.children.length === 0) {
          let selectedColor = null;
          let selectedStyle = 'solid';
          
          // Style button logic
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
else:
    print("Failed to find target_init_colors")
    sys.exit(1)

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
else:
    print("Failed to find target_fetch")
    sys.exit(1)

# 3. Update syncBalls
target_syncballs = """        pbBalls[name] = ball;
        World.add(pbEngine.world, ball);
      } else {
        // Update color dynamically if user picks a new one in lobby
        pbBalls[name].render.fillStyle = color;
      }
    });"""
replacement_syncballs = """        pbBalls[name] = ball;
        ball.plugin.style = (state.styles && state.styles[name]) ? state.styles[name] : 'solid';
        ball.render.visible = false; // We draw manually in afterRender
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
else:
    print("Failed to find target_syncballs")
    sys.exit(1)

# 4. Update afterRender drawing logic
target_afterrender = """      // 4. Custom Billiard Balls
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      Object.values(pbBalls).forEach(b => {
        const sp = toScreen(b.position.x, b.position.y);
        if (sp.y < -30 || sp.y > height + 30) return;
        // Number in center (using index)
        ctx.fillStyle = '#000';
        ctx.font = old \px Arial;
        ctx.fillText(b.plugin.num, sp.x, sp.y + 1);

        // Name tag above ball
        let name = b.plugin.name;
        if (name.length > 5) name = name.substring(0, 4) + '..';
        const nameY = sp.y - r - 8;
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.font = 'bold 11px Arial';
        ctx.strokeText(name, sp.x, nameY);
        ctx.fillStyle = '#fff';
        ctx.fillText(name, sp.x, nameY);
      });"""

# Wait,  is not defined in the original Object.values(pbBalls).forEach(b => { loop!
# Ah! Let me check how  is used in the original!
# Ah, I see \. Where did  come from? I need to look closely at the original!
