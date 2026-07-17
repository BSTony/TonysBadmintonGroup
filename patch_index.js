const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

const target = pp.post('/api/pinball/set-color', express.json(), (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
  if (!pinballRoom.colors) pinballRoom.colors = {};
  pinballRoom.colors[name] = color;
  io.emit('pinball_state', pinballRoom);
  res.json({ success: true, color });
});;

const target2 = pp.post('/api/pinball/set-color', express.json(), (req, res) => {
    const { name, color } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
    if (!pinballRoom.colors) pinballRoom.colors = {};
    pinballRoom.colors[name] = color;
    io.emit('pinball_state', pinballRoom);
    res.json({ success: true, color });
  });;

const replacement = pp.post('/api/pinball/set-color', express.json(), (req, res) => {
    const { name, color, style } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Missing name or color' });
    if (!pinballRoom.colors) pinballRoom.colors = {};
    if (!pinballRoom.styles) pinballRoom.styles = {};
    pinballRoom.colors[name] = color;
    if (style) pinballRoom.styles[name] = style;
    io.emit('pinball_state', pinballRoom);
    res.json({ success: true, color, style });
  });;

if (content.includes(target)) {
  fs.writeFileSync('index.js', content.replace(target, replacement));
  console.log('Patched index.js with target 1');
} else if (content.includes(target2)) {
  fs.writeFileSync('index.js', content.replace(target2, replacement));
  console.log('Patched index.js with target 2');
} else {
  console.log('Could not find target string to replace');
}
