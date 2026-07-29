import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  app.post('/api/pinball/set-color', express.json(), (req, res) => {
    const { name, color, style } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
    if (!pinballRoom.colors) pinballRoom.colors = {};
    if (!pinballRoom.styles) pinballRoom.styles = {};
    pinballRoom.colors[name] = color;
    if (style) pinballRoom.styles[name] = style;
    io.emit('pinball_state', pinballRoom);
    res.json({ success: true, color, style });
  });
  if (!pinballRoom.colors) pinballRoom.colors = {};
  pinballRoom.colors[name] = color;
  io.emit('pinball_state', pinballRoom);
  res.json({ success: true, color });
});"""

replacement = """  app.post('/api/pinball/set-color', express.json(), (req, res) => {
    const { name, color, style } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
    if (!pinballRoom.colors) pinballRoom.colors = {};
    if (!pinballRoom.styles) pinballRoom.styles = {};
    pinballRoom.colors[name] = color;
    if (style) pinballRoom.styles[name] = style;
    io.emit('pinball_state', pinballRoom);
    res.json({ success: true, color, style });
  });"""

# Because of whitespaces, let's use regex
import re
pattern = re.compile(r"app\.post\('/api/pinball/set-color'.*?res\.json\(\{ success: true, color \}\);\n\}\);", re.DOTALL)

match = pattern.search(content)
if match:
    content = content[:match.start()] + replacement.strip() + content[match.end():]
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed syntax error with regex!")
else:
    print("Target block not found by regex")
