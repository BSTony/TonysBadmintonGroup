import re

with open('public/style.css', 'r', encoding='utf-8') as f:
    content = f.read()

old_tags = """/* 資訊標籤方塊 */
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
}"""

new_tags = """/* 資訊標籤方塊 (兩列排版) */
.info-tags {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 12px;
}
.info-row {
  display: flex;
  gap: 8px;
}
.info-tag {
  flex: 1;
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
}"""

if old_tags in content:
    content = content.replace(old_tags, new_tags)
    print("Replaced info-tags")

# Add action row styles
action_styles = """
/* 動作列重構 */
.action-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  align-items: center;
}
.btn-square {
  flex: 0 0 auto !important;
  width: 44px;
  height: 44px;
  padding: 0 !important;
  border-radius: 8px;
  font-size: 18px;
}
.name-input {
  flex: 1;
  height: 44px;
  background-color: var(--bg-color);
  border: 1px solid var(--surface-color-light);
  color: var(--text-main);
  padding: 0 12px;
  border-radius: 8px;
  font-size: 14px;
}
.name-input:focus {
  outline: none;
  border-color: var(--primary-color);
}
.error-msg {
  color: var(--danger-color);
  font-size: 12px;
  margin-top: 4px;
  display: none;
}
"""

if '.action-row {' not in content:
    content += action_styles
    print("Added action styles")

with open('public/style.css', 'w', encoding='utf-8') as f:
    f.write(content)
