import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update API route logging
api_old = """app.get('/api/game/:gid', (req, res) => {
  const gid = req.params.gid;
  const groupGames = Object.values(games).filter(g => g.gid === gid && g.active);"""
api_new = """app.get('/api/game/:gid', (req, res) => {
  const gid = req.params.gid;
  const groupGames = Object.values(games).filter(g => g.gid === gid && g.active);
  console.log(`[API] Fetching games for gid: ${gid}, Found: ${groupGames.length}, Total games: ${Object.keys(games).length}`);"""
if api_old in content:
    content = content.replace(api_old, api_new)

# 2. Update regexes in handleEvent
regex_old = """const titleMatch = text.match(/標題\\s*[:：]?\\s*[{\\uff5b]([\\s\\S]*?)[}\\uff5d]/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*[{\\uff5b](\\d+)[}\\uff5d]/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*[{\\uff5b](\\d+)[}\\uff5d]/);"""
regex_new = """// 支援有大括號或沒有大括號 (用空格/換行分隔)
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]+))/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);"""

if regex_old in content:
    content = content.replace(regex_old, regex_new)

# 3. Update title, limit, backupLimit assignments
assign_old = """const title = titleMatch ? titleMatch[1].trim() : '羽球接龍';
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1], 10) : 5;"""
assign_new = """const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : '羽球接龍';
      const limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2], 10) : 20;
      const backupLimit = backupMatch ? parseInt(backupMatch[1] || backupMatch[2], 10) : 5;"""
if assign_old in content:
    content = content.replace(assign_old, assign_new)

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Regex fixed")
