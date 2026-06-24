import sys

with open('public/style.css', 'r', encoding='utf-8') as f:
    content = f.read()

tags_css = """
/* 資訊標籤方塊 */
.info-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 12px;
}
.info-tag {
  background-color: var(--card-bg);
  color: var(--text-color);
  border: 1px solid rgba(0, 0, 0, 0.05);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
[data-theme="dark"] .info-tag {
  background-color: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.05);
}
.game-note {
  background-color: rgba(67, 160, 71, 0.1);
  color: #2e7d32;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 8px;
  margin-bottom: 12px;
  line-height: 1.5;
  border-left: 3px solid var(--primary-color);
}
[data-theme="dark"] .game-note {
  color: #81c784;
}
"""

if '.info-tags' not in content:
    content += tags_css
    with open('public/style.css', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added CSS")
