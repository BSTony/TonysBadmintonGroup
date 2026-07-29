import sys

with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target_ui = """          <div id="pinball-color-picker-ui" class="hidden" style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); border: 2px solid #3498db; padding: 15px; border-radius: 15px; z-index: 120; text-align: center; width: 90%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.6);">
            <div style="color: white; font-weight: bold; margin-bottom: 10px; font-size: 16px;">挑選你的專屬彈珠顏色</div>
            <div id="pinball-color-options" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; justify-items: center; margin-bottom: 10px;">
              <!-- JS will inject color buttons -->
            </div>
            <button id="btn-pinball-color-confirm" class="btn-primary" style="margin-top: 15px; width: 100%; display: none; padding: 10px; font-size: 16px; border-radius: 8px; cursor: pointer; border: none; background: #3498db; color: white; font-weight: bold;">確認</button>
          </div>"""

replacement_ui = """          <div id="pinball-color-picker-ui" class="hidden" style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); border: 2px solid #3498db; padding: 15px; border-radius: 15px; z-index: 120; text-align: center; width: 90%; max-width: 400px; box-shadow: 0 5px 20px rgba(0,0,0,0.6);">
            <div style="color: white; font-weight: bold; margin-bottom: 10px; font-size: 16px;">挑選專屬彈珠樣式與顏色</div>
            
            <div id="pinball-style-options" style="display: flex; justify-content: space-around; margin-bottom: 15px;">
              <button class="pinball-style-btn active" data-style="solid" style="background: #2c3e50; color: white; border: 2px solid #3498db; border-radius: 20px; padding: 5px 15px; cursor: pointer;">純色</button>
              <button class="pinball-style-btn" data-style="billiard" style="background: #2c3e50; color: white; border: 2px solid transparent; border-radius: 20px; padding: 5px 15px; cursor: pointer;">撞球</button>
              <button class="pinball-style-btn" data-style="gradient" style="background: #2c3e50; color: white; border: 2px solid transparent; border-radius: 20px; padding: 5px 15px; cursor: pointer;">漸層</button>
            </div>

            <div id="pinball-color-options" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; justify-items: center; margin-bottom: 10px;">
              <!-- JS will inject color buttons -->
            </div>
            <button id="btn-pinball-color-confirm" class="btn-primary" style="margin-top: 15px; width: 100%; display: none; padding: 10px; font-size: 16px; border-radius: 8px; cursor: pointer; border: none; background: #3498db; color: white; font-weight: bold;">確認</button>
          </div>"""

if target_ui not in content:
    print("Target UI block not found in index.html")
    sys.exit(1)

content = content.replace(target_ui, replacement_ui)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("index.html patched with style buttons")
