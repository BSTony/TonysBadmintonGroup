// ================= Template Admin Logic =================
function showTemplateAdminView() {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('template-admin-view').classList.remove('hidden');
  loadTemplates();
  document.getElementById('ta-template-name').value = '';
  document.getElementById('ta-template-content').value = '';
  document.getElementById('btn-ta-delete').style.display = 'none';
}

window.showTemplateAdminView = showTemplateAdminView;

const btnBackTemplateAdmin = document.getElementById('btn-back-template-admin');
if (btnBackTemplateAdmin) {
  btnBackTemplateAdmin.onclick = async () => {
    document.getElementById('template-admin-view').classList.add('hidden');
    await loadGamesLobby();
  };
}

const taTemplateSelect = document.getElementById('ta-template-select');
if (taTemplateSelect) {
  taTemplateSelect.onchange = (e) => {
    const name = e.target.value;
    const nameInput = document.getElementById('ta-template-name');
    const contentInput = document.getElementById('ta-template-content');
    const deleteBtn = document.getElementById('btn-ta-delete');
    
    if (name && currentGroupTemplates[name]) {
      nameInput.value = name;
      contentInput.value = currentGroupTemplates[name];
      deleteBtn.style.display = 'block';
    } else {
      nameInput.value = '';
      contentInput.value = '';
      deleteBtn.style.display = 'none';
    }
  };
}

const btnTaSave = document.getElementById('btn-ta-save');
if (btnTaSave) {
  btnTaSave.onclick = async () => {
    const name = document.getElementById('ta-template-name').value.trim();
    const content = document.getElementById('ta-template-content').value.trim();
    
    if (!name) return alert('請輸入範本名稱');
    if (!content) return alert('請輸入名單內容');
    
    appDiv.className = 'loading';
    try {
      const res = await fetch(`/api/templates/${currentGroupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.userId,
          action: 'save',
          name: name,
          content: content
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadTemplates();
        document.getElementById('ta-template-select').value = name;
        document.getElementById('ta-template-select').dispatchEvent(new Event('change'));
        alert('儲存成功！');
      } else {
        alert(data.error || '儲存失敗');
      }
    } catch (e) {
      alert('網路錯誤，無法儲存至伺服器');
    } finally {
      appDiv.className = '';
    }
  };
}

const btnTaDelete = document.getElementById('btn-ta-delete');
if (btnTaDelete) {
  btnTaDelete.onclick = async () => {
    const name = document.getElementById('ta-template-name').value.trim();
    if (!name) return;
    if (!confirm(`確定要刪除範本「${name}」嗎？`)) return;
    
    appDiv.className = 'loading';
    try {
      const res = await fetch(`/api/templates/${currentGroupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.userId,
          action: 'delete',
          name: name
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadTemplates();
        document.getElementById('ta-template-select').value = '';
        document.getElementById('ta-template-select').dispatchEvent(new Event('change'));
        alert('刪除成功！');
      } else {
        alert(data.error || '刪除失敗');
      }
    } catch (e) {
      alert('網路錯誤，無法連線伺服器');
    } finally {
      appDiv.className = '';
    }
  };
}

// 畫面讀取完畢初始化
