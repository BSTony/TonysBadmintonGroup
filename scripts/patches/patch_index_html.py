import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""          <div id="pinball-spectator-ui" class="hidden" style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold; font-size: 18px; text-align: center; white-space: nowrap; z-index: 10; border: 1px solid rgba(255,255,255,0.3);">
            準備就緒
          </div>"""

replacement = r"""          <div id="pinball-spectator-ui" class="hidden" style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold; font-size: 18px; text-align: center; white-space: nowrap; z-index: 10; border: 1px solid rgba(255,255,255,0.3);">
            準備就緒
          </div>
          
          <!-- Normal user join button -->
          <button id="btn-join-pinball" class="hidden btn-primary" style="position: absolute; top: 70px; left: 50%; transform: translateX(-50%); padding: 10px 20px; font-size: 18px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 100; animation: pulse 1.5s infinite; cursor: pointer; background-color: #2ecc71;">🙋‍♂️ 報名參加</button>"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_norm = re.sub(r'\r\n', '\n', target)

if target_norm in content_normalized:
    content_normalized = content_normalized.replace(target_norm, replacement)
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(content_normalized)
    print("Frontend patched")
else:
    print("Frontend target not found")
