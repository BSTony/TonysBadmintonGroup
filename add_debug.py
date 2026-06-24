import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add a debug endpoint
debug_endpoint = """
// 隱藏的 debug 端點，用來印出當前記憶體狀態
app.get('/api/debug_games', (req, res) => {
  res.json({
    total: Object.keys(games).length,
    games: games
  });
});
"""

if '/api/debug_games' not in content:
    # insert before app.listen
    listen_idx = content.rfind('app.listen(')
    if listen_idx != -1:
        content = content[:listen_idx] + debug_endpoint + content[listen_idx:]
        with open('index.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Debug endpoint added")
    else:
        print("Could not find app.listen")
else:
    print("Already added")
