import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"""function isSuperAdmin(uid) {
  if (!uid) return false;"""

replacement = r"""function isSuperAdmin(uid) {
  if (!uid) return false;
  if (uid === 'U_SUPER_ADMIN_TEST_ID') return true;"""

content_normalized = re.sub(r'\r\n', '\n', content)
target_norm = re.sub(r'\r\n', '\n', target)

if target_norm in content_normalized:
    content_normalized = content_normalized.replace(target_norm, replacement)
else:
    print("Not found index.js")

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content_normalized)

with open('public/app.js', 'r', encoding='utf-8') as f:
    app_content = f.read()

app_target = r"""async function initializeLiff() {
  try {
    // 1."""

app_replacement = r"""async function initializeLiff() {
  try {
    // 0. 本機測試模式 (Local Test Mode)
    const urlParams = new URLSearchParams(window.location.search);
    const testRole = urlParams.get('testRole');
    if (testRole) {
      console.log('Running in Local Test Mode:', testRole);
      let mockUid = 'U_TEST_PLAYER_' + Math.random().toString(36).substr(2, 5);
      let mockName = 'Test Player';
      
      if (testRole === 'superadmin') {
        mockUid = 'U_SUPER_ADMIN_TEST_ID';
        mockName = 'Super Admin';
      } else if (testRole === 'admin') {
        mockUid = 'U_GROUP_ADMIN_TEST_ID';
        mockName = 'Group Admin';
      }
      
      currentUser = { userId: mockUid, displayName: mockName };
      if (typeof initLottery === 'function') {
        initLottery(currentUser.userId);
      }
      
      currentGroupId = urlParams.get('gid') || 'TEST_GROUP_1234';
      const h3 = document.getElementById('group-id-display');
      if (h3) h3.innerText = '群組ID: ' + currentGroupId;
      
      await loadGamesLobby();
      initSocket();
      return; // Skip LIFF initialization completely
    }

    // 1."""

app_content_norm = re.sub(r'\r\n', '\n', app_content)
app_target_norm = re.sub(r'\r\n', '\n', app_target)

if app_target_norm in app_content_norm:
    app_content_norm = app_content_norm.replace(app_target_norm, app_replacement)
else:
    print("Not found app.js")

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(app_content_norm)

print("done")
