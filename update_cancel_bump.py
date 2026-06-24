import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Modify /api/action cancel logic
cancel_old = """    } else if (action === 'cancel') {
      if (!currentList.includes(name)) {
        return res.status(400).json({ error: '您不在名單中' });
      }
      await removeFromList(gameId, name, { uid });
      for(let i=1; i<c; i++) {
        await removeAnon(gameId, { uid });
      }
    } else {"""

cancel_new = """    } else if (action === 'cancel') {
      if (!currentList.includes(name)) {
        return res.status(400).json({ error: '您不在名單中' });
      }
      
      const limit = game.sections[0].limit;
      const mainListBefore = game.sections[0].list.slice(0, limit);
      
      await removeFromList(gameId, name, { uid });
      for(let i=1; i<c; i++) {
        await removeAnon(gameId, { uid });
      }
      
      const mainListAfter = game.sections[0].list.slice(0, limit);
      
      // 找出遞補上來的人 (在 mainListAfter 但不在 mainListBefore)
      const bumpedNames = mainListAfter.filter(n => !mainListBefore.includes(n) && n !== '__ANON__');
      
      if (bumpedNames.length > 0) {
        try {
          const bumpMsg = bumpedNames.join('、');
          await client.pushMessage(game.gid, { type: 'text', text: `🎉 【${game.title}】\\n恭喜 ${bumpMsg} 候補成功！` });
        } catch(e) {
          console.error('遞補推播失敗:', e);
        }
      }
      
    } else {"""

if cancel_old in content:
    content = content.replace(cancel_old, cancel_new)
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated cancel logic in index.js")
else:
    print("Could not find cancel logic")
