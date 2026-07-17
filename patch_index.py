import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = "app.post('/api/pinball/set-color', express.json(), (req, res) => {"

if target not in content:
    print("Target not found!")
    sys.exit(1)

pos = content.find(target)
end_pos = content.find("});", pos) + 3

replacement = """app.post('/api/pinball/set-color', express.json(), (req, res) => {
    const { name, color, style } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
    if (!pinballRoom.colors) pinballRoom.colors = {};
    if (!pinballRoom.styles) pinballRoom.styles = {};
    pinballRoom.colors[name] = color;
    if (style) pinballRoom.styles[name] = style;
    io.emit('pinball_state', pinballRoom);
    res.json({ success: true, color, style });
  });"""

content = content[:pos] + replacement + content[end_pos:]

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("index.js patched correctly")
