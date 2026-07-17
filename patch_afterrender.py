import re
import sys

with open('public/pinball.js', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(r"// Main ball body.*?ctx\.fill\(\);\s*}", re.DOTALL)
match = pattern.search(content)

if match:
    replacement = """// Custom style rendering
        const style = (b.plugin && b.plugin.style) ? b.plugin.style : 'solid';
        
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(b.angle);

        if (style === 'solid') {
          ctx.fillStyle = b.render.fillStyle;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (style === 'billiard') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = b.render.fillStyle;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillRect(-r, -r*0.5, r * 2, r);
        } else if (style === 'gradient') {
          const grad = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.1, 0, 0, r);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, b.render.fillStyle);
          grad.addColorStop(1, '#000000');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();"""
    content = content[:match.start()] + replacement + content[match.end():]
    with open('public/pinball.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("afterRender successfully patched using regex")
else:
    print("Pattern not found")
