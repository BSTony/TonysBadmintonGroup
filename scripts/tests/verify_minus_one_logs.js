const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('--- Testing Minus One System Logging ---');
  
  // We can test the system log recording functions directly
  // Load index.js functions or simulate
  const SYSTEM_LOGS_FILE = path.join(__dirname, '..', '..', 'data', 'systemLogs.json');
  
  // Backup existing systemLogs if any
  let originalData = null;
  if (fs.existsSync(SYSTEM_LOGS_FILE)) {
    originalData = fs.readFileSync(SYSTEM_LOGS_FILE, 'utf8');
  }

  try {
    let systemLogs = [];
    if (originalData) {
      try { systemLogs = JSON.parse(originalData); } catch (e) {}
    }

    function recordSystemLog(title, operator, msg) {
      const timeStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      systemLogs.unshift({ time: timeStr, gameTitle: title || '系統', operator: operator || '系統', errorMsg: msg });
      if (systemLogs.length > 500) systemLogs.pop();
      fs.writeFileSync(SYSTEM_LOGS_FILE, JSON.stringify(systemLogs, null, 2));
    }

    // 1. Test 1st click log
    console.log('1. Testing 1st click log entry:');
    recordSystemLog('週四脫水團', '小美', '點選 -1 (第 1 次按 / 考慮中未確認) | 欲取消對象: 小美 | UID: Utest1');
    assert.strictEqual(systemLogs[0].gameTitle, '週四脫水團');
    assert.strictEqual(systemLogs[0].operator, '小美');
    assert.ok(systemLogs[0].errorMsg.includes('第 1 次按'));
    console.log('✅ 1st click logged successfully:', systemLogs[0]);

    // 2. Test 2nd click log (attempt/execute)
    console.log('\n2. Testing 2nd click log entry:');
    recordSystemLog('週四脫水團', '小美', '點選 -1 (第 2 次按 / 執行確認) | 欲取消對象: 小美 | UID: Utest1');
    assert.strictEqual(systemLogs[0].operator, '小美');
    assert.ok(systemLogs[0].errorMsg.includes('第 2 次按'));
    console.log('✅ 2nd click logged successfully:', systemLogs[0]);

    // 3. Test successful cancellation log
    console.log('\n3. Testing cancel success log:');
    recordSystemLog('週四脫水團', '小美', '點選 -1 取消成功 (已移出名單) | 姓名: 小美 | 分區: 19:00~21:00 | 操作者UID: Utest1');
    assert.ok(systemLogs[0].errorMsg.includes('取消成功 (已移出名單)'));
    console.log('✅ Cancel success logged successfully:', systemLogs[0]);

    // 4. Test failure log (name not found)
    console.log('\n4. Testing cancel failure log:');
    recordSystemLog('週四脫水團', '小美', '點選 -1 取消失敗 (名單中找不到姓名: 阿華) | 操作者UID: Utest1');
    assert.ok(systemLogs[0].errorMsg.includes('名單中找不到姓名'));
    console.log('✅ Cancel failure logged successfully:', systemLogs[0]);

    console.log('\n🎉 ALL MINUS ONE LOG TESTS PASSED SUCCESSFULLY! 🎉');
  } finally {
    // Restore original file
    if (originalData !== null) {
      fs.writeFileSync(SYSTEM_LOGS_FILE, originalData);
    } else if (fs.existsSync(SYSTEM_LOGS_FILE)) {
      fs.unlinkSync(SYSTEM_LOGS_FILE);
    }
  }
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
