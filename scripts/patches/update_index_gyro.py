import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""                <li>👆 可點選並拖曳自己的彈珠去碰撞別人</li>
              </ul>"""

replacement = r"""                <li>👆 可點選並拖曳自己的彈珠去碰撞別人</li>
                <li>📱 <b>手機玩家：</b>比賽開始後，可透過「左右傾斜手機」來些微控制彈珠方向！</li>
              </ul>
              <button onclick="if(window.requestPinballGyroPermission) window.requestPinballGyroPermission();" style="padding: 10px 20px; font-size: 20px; border-radius: 10px; background-color: #3498db; color: white; border: none; cursor: pointer; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                🎮 啟用手機體感控制 (G-Sensor)
              </button>"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_norm = re.sub(r'\r\n', '\n', target)

if target_norm in content_normalized:
    content_normalized = content_normalized.replace(target_norm, replacement)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

print("done")
