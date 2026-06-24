import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace 接龍開始 regex
old_start_regex = """    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      // 支援有大括號或沒有大括號 (用空格/換行分隔)
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]+))/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);"""

new_start_regex = """    // 1. 接龍開始
    if (text.startsWith('接龍開始')) {
      // 支援有大括號或沒有大括號 (用空格/換行分隔)
      const titleMatch = text.match(/標題\\s*[:：]?\\s*(?:[{\\uff5b]([\\s\\S]*?)[}\\uff5d]|([^\\n]*?(?=\\s*(?:人數|候補|時間|備註|名單|$))))/);
      const limitMatch = text.match(/人數\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);
      const backupMatch = text.match(/候補\\s*[:：]?\\s*(?:[{\\uff5b](\\d+)[}\\uff5d]|(\\d+))/);"""

if old_start_regex in content:
    content = content.replace(old_start_regex, new_start_regex)
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated start regex")
else:
    print("Could not find old_start_regex")
