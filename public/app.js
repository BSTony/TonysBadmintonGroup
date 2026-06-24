let currentUser = null;
let currentGroupId = null;

// 在載入時初始化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. 取得後端的設定 (包含 LIFF ID)
    const configRes = await fetch('/api/config');
    if (!configRes.ok) throw new Error('無法取得系統設定');
    const config = await configRes.json();
    
    if (!config.liffId) {
      throw new Error('系統未設定 LIFF ID');
    }

    // 2. 初始化 LIFF
    await liff.init({ liffId: config.liffId });
    
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    // 3. 取得使用者資料
    const profile = await liff.getProfile();
    currentUser = {
      uid: profile.userId,
      name: profile.displayName,
      pictureUrl: profile.pictureUrl
    };

    // 顯示使用者資訊
    document.getElementById('user-name').textContent = currentUser.name;
    if (currentUser.pictureUrl) {
      const avatar = document.getElementById('user-avatar');
      avatar.src = currentUser.pictureUrl;
      avatar.classList.remove('hidden');
    }

    // 4. 取得群組 Context
    const context = liff.getContext();
    if (context && (context.type === 'group' || context.type === 'room')) {
      currentGroupId = context.groupId || context.roomId;
    } else {
      // 開發測試用：如果不是在群組內打開，詢問測試用的 Group ID
      // 實際使用時，這段會被註解掉，因為只能在群組內使用
      const testGid = localStorage.getItem('test_gid');
      if (testGid) {
        currentGroupId = testGid;
      } else {
        throw new Error('此功能只能在 LINE 群組內使用喔！');
      }
    }

    // 5. 載入接龍資料
    await fetchGameData();
    
    // 隱藏載入畫面
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('app-container').style.display = 'block';

  } catch (error) {
    console.error('Initialization error:', error);
    showError(error.message);
  }
});

async function fetchGameData() {
  try {
    const res = await fetch(`/api/game/${currentGroupId}`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('目前群組沒有正在進行的接龍');
      }
      throw new Error('讀取資料失敗');
    }
    
    const game = await res.json();
    renderGame(game);
  } catch (err) {
    showError(err.message);
  }
}

function renderGame(game) {
  if (!game.active) {
    showError('此接龍已經結束囉！');
    return;
  }

  // 設定標題
  document.getElementById('game-title').textContent = game.title || '羽球接龍';
  
  // 取得第一區段（預設主報名區）
  const section = game.sections[0];
  if (!section) return;

  const list = section.list || [];
  const limit = section.limit || 0;
  const backupLimit = section.backupLimit || 0;

  // 計算正取與候補
  const enrolledList = list.slice(0, limit);
  const backupList = list.slice(limit, limit + backupLimit);

  // 更新統計數字
  document.getElementById('count-enrolled').textContent = enrolledList.length;
  document.getElementById('count-limit').textContent = limit;
  document.getElementById('count-backup').textContent = backupList.length;
  document.getElementById('badge-enrolled').textContent = `${enrolledList.length}/${limit}`;
  document.getElementById('badge-backup').textContent = backupList.length;

  // 渲染正取名單
  const enrolledHtml = enrolledList.map((name, i) => {
    const isMe = name === currentUser?.name;
    const displayName = isAnon(name, game) ? '***' : name;
    return `
      <li class="player-item ${isMe ? 'is-me' : ''}">
        <span class="player-index">${i + 1}.</span>
        <span class="player-name">${displayName}</span>
      </li>
    `;
  }).join('');
  document.getElementById('list-enrolled').innerHTML = enrolledHtml || '<li class="player-item"><span class="player-name" style="color:var(--text-muted)">尚無人報名</span></li>';

  // 渲染候補名單
  if (backupList.length > 0) {
    document.getElementById('backup-section').style.display = 'block';
    const backupHtml = backupList.map((name, i) => {
      const isMe = name === currentUser?.name;
      const displayName = isAnon(name, game) ? '***' : name;
      return `
        <li class="player-item ${isMe ? 'is-me' : ''}">
          <span class="player-index">補${i + 1}.</span>
          <span class="player-name">${displayName}</span>
        </li>
      `;
    }).join('');
    document.getElementById('list-backup').innerHTML = backupHtml;
  } else {
    document.getElementById('backup-section').style.display = 'none';
  }

  // 按鈕狀態控制
  const hasEnrolled = list.includes(currentUser?.name);
  const btnMinus = document.getElementById('btn-minus');
  const btnPlus1 = document.getElementById('btn-plus-1');

  if (hasEnrolled) {
    btnMinus.disabled = false;
  } else {
    btnMinus.disabled = true;
  }
}

function isAnon(name, game) {
  if (name === '__ANON__') return true;
  if (game.anonymous && game.anonymous.includes(name)) return true;
  return false;
}

async function handleAction(actionType, count) {
  if (!currentGroupId || !currentUser) return;

  const btnMinus = document.getElementById('btn-minus');
  const btnPlus1 = document.getElementById('btn-plus-1');
  const btnPlus2 = document.getElementById('btn-plus-2');
  
  // 禁用按鈕避免重複點擊
  btnMinus.disabled = true;
  btnPlus1.disabled = true;
  btnPlus2.disabled = true;

  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        gid: currentGroupId,
        uid: currentUser.uid,
        name: currentUser.name,
        action: actionType,
        count: count
      })
    });

    const result = await res.json();
    
    if (!res.ok) {
      throw new Error(result.error || '操作失敗');
    }

    // 重新拉取資料更新畫面
    await fetchGameData();
    
    // 給予視覺回饋 (可選，例如顯示一個勾勾)
    // liff.closeWindow(); // 如果希望操作完直接關閉，可以打開這行
    
  } catch (err) {
    alert(err.message);
    // 恢復按鈕狀態
    fetchGameData();
  }
}

function showError(message) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app-container').style.display = 'none';
  
  const errorScreen = document.getElementById('error-screen');
  document.getElementById('error-message').textContent = message;
  errorScreen.classList.remove('hidden');
}
