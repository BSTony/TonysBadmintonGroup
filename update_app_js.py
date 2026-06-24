import sys

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace liff.getContext logic
old_logic = """    // 4. 取得群組 Context
    const context = liff.getContext();
    if (context && (context.type === 'group' || context.type === 'room')) {
      currentGroupId = context.groupId || context.roomId;
    } else if (context && context.type === 'utou') {
      currentGroupId = currentUser.userId;
    } else {
      currentGroupId = currentUser.userId;
    }"""

new_logic = """    // 4. 取得群組 Context
    const urlParams = new URLSearchParams(window.location.search);
    const gidFromUrl = urlParams.get('gid');
    const context = liff.getContext();
    
    if (gidFromUrl) {
      currentGroupId = gidFromUrl;
    } else if (context && (context.type === 'group' || context.type === 'room')) {
      currentGroupId = context.groupId || context.roomId;
    } else if (context && context.type === 'utou') {
      currentGroupId = currentUser.userId;
    } else {
      currentGroupId = currentUser.userId;
    }"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open('public/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated public/app.js")
else:
    print("Could not find logic in public/app.js")
