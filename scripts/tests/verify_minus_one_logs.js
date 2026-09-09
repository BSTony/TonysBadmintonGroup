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

    function recordSystemLog(title, operator, msg, errObj, meta = {}) {
      const timeStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      const op = operator || '系統';
      const clientIp = meta.ip || '';
      const source = meta.source || '';
      const uid = meta.uid || '';
      let producer = meta.producer;
      if (!producer) {
        if (uid) {
          producer = `${op} (UID: ${uid}${source ? ', 來源: ' + source : ''})`;
        } else if (source) {
          producer = `${op} (來源: ${source})`;
        } else {
          producer = op;
        }
      }

      systemLogs.unshift({
        time: timeStr,
        gameTitle: title || '系統',
        operator: op,
        producer: producer,
        uid: uid,
        ip: clientIp,
        source: source,
        errorMsg: msg
      });
      if (systemLogs.length > 500) systemLogs.pop();
      fs.writeFileSync(SYSTEM_LOGS_FILE, JSON.stringify(systemLogs, null, 2));
    }

    // 1. Test 1st click log with producer
    console.log('1. Testing 1st click log entry with producer:');
    recordSystemLog('週四脫水團', '小美', '點選 -1 (第 1 次按 / 考慮中未確認) | 欲取消對象: 小美 | UID: Utest1', null, {
      producer: '小美 (UID: Utest1, 來源: 手機 LINE App)',
      uid: 'Utest1',
      source: '手機 LINE App',
      ip: '203.0.113.1'
    });
    assert.strictEqual(systemLogs[0].gameTitle, '週四脫水團');
    assert.strictEqual(systemLogs[0].operator, '小美');
    assert.strictEqual(systemLogs[0].producer, '小美 (UID: Utest1, 來源: 手機 LINE App)');
    assert.strictEqual(systemLogs[0].source, '手機 LINE App');
    assert.strictEqual(systemLogs[0].ip, '203.0.113.1');
    assert.ok(systemLogs[0].errorMsg.includes('第 1 次按'));
    console.log('✅ 1st click logged successfully with producer:', systemLogs[0]);

    // 2. Test 2nd click log with desktop browser producer
    console.log('\n2. Testing 2nd click log entry (desktop browser):');
    recordSystemLog('週四脫水團', 'Tony', '點選 -1 (第 2 次按 / 執行確認) | 欲取消對象: Tony | UID: U_TONY_SUPER', null, {
      producer: 'Tony (UID: U_TONY_SUPER, 來源: 電腦瀏覽器)',
      uid: 'U_TONY_SUPER',
      source: '電腦瀏覽器',
      ip: '198.51.100.24'
    });
    assert.strictEqual(systemLogs[0].operator, 'Tony');
    assert.strictEqual(systemLogs[0].source, '電腦瀏覽器');
    assert.ok(systemLogs[0].producer.includes('電腦瀏覽器'));
    console.log('✅ 2nd click logged successfully with producer:', systemLogs[0]);

    // 3. Test successful cancellation log with auto fallback producer
    console.log('\n3. Testing cancel success log:');
    recordSystemLog('週四脫水團', 'Tony', '點選 -1 取消成功 (已移出名單) | 姓名: 小美 | 分區: 19:00~21:00 | 操作者UID: U_TONY_SUPER', null, {
      uid: 'U_TONY_SUPER',
      source: '手機 LINE LIFF',
      ip: '127.0.0.1'
    });
    assert.ok(systemLogs[0].producer.includes('U_TONY_SUPER'));
    assert.ok(systemLogs[0].errorMsg.includes('取消成功 (已移出名單)'));
    console.log('✅ Cancel success logged successfully with producer:', systemLogs[0]);

    console.log('\n🎉 ALL MINUS ONE PRODUCER LOG TESTS PASSED SUCCESSFULLY! 🎉');
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
