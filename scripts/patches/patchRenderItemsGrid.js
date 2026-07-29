const fs = require('fs');
const file = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /function renderItemsGrid\(\) \{[\s\S]*?(?=\n\}\n\nwindow\.forceOpenDetail)/;

const newCode = `function renderItemsGrid() {
  if (!gbItemsGrid || !currentGroupBuyData) return;
  gbItemsGrid.innerHTML = '';

  let filtered = currentGroupBuyData.items || [];
  if (activeCategoryFilter === '🌟 已選購') {
    filtered = filtered.filter(i => currentCart[i.id] > 0);
  } else if (activeCategoryFilter !== '全部') {
    filtered = filtered.filter(i => i.category === activeCategoryFilter);
  }
  
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(i => 
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q)) ||
      (i.description && i.description.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    gbItemsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#888;">找不到符合條件的商品</div>';
    return;
  }

  gbItemsGrid.style.display = 'flex';
  gbItemsGrid.style.flexDirection = 'column';
  gbItemsGrid.style.gap = '12px';

  // 分群
  const grouped = {};
  filtered.forEach(item => {
    const c = item.category || '未分類';
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(item);
  });

  Object.keys(grouped).forEach(cat => {
    const catContainer = document.createElement('div');
    catContainer.style.cssText = 'border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

    let headerBg = '#f1f5f9';
    let headerColor = '#334155';
    if (cat === '蔬果系列') { headerBg = '#f3e8ff'; headerColor = '#6b21a8'; }
    else if (cat === '果乾系列') { headerBg = '#ffedd5'; headerColor = '#c2410c'; }

    const isCatExpanded = (activeCategoryFilter !== '全部') || currentSearchQuery || window.expandedCategories[cat];

    const catHeader = document.createElement('div');
    catHeader.style.cssText = \`padding: 12px 16px; cursor: pointer; font-weight: bold; font-size: 16px; display: flex; justify-content: space-between; align-items: center; background: \${headerBg}; color: \${headerColor}; border-bottom: \${isCatExpanded ? '1px solid #cbd5e1' : 'none'}; transition: background 0.2s;\`;
    catHeader.innerHTML = \`
      <span>\${cat} <span style="font-size:13px; font-weight:normal; opacity:0.8; margin-left:6px;">(\${grouped[cat].length}項)</span></span>
      <span>\${isCatExpanded ? '▲' : '▼'}</span>
    \`;

    catHeader.onclick = () => {
      window.expandedCategories[cat] = !isCatExpanded;
      renderItemsGrid();
    };
    catContainer.appendChild(catHeader);

    if (isCatExpanded) {
      const itemsContainer = document.createElement('div');
      itemsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px; background: #fafafa;';

      grouped[cat].forEach(item => {
        const card = document.createElement('div');
        card.className = 'gb-list-item';
        
        const qty = currentCart[item.id] || 0;
        const isExpanded = (window.activeExpandedItemId === item.id);
        
        card.style.cssText = \`background:white; border:1px solid \${qty > 0 ? '#10b981' : '#e2e8f0'}; border-radius:8px; overflow:hidden; transition:all 0.2s ease; \${qty > 0 && !isExpanded ? 'background:#ecfdf5;' : ''}\`;

        const rowHtml = \`
          <div class="gb-list-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px; cursor:pointer;">
            <div style="flex:1; font-weight:bold; color:#2563eb; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              \${item.name}
            </div>
            <div style="flex:2; font-size:12px; color:#64748b; padding:0 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              \${item.description || '暫無說明'}
            </div>
            <div style="flex:0 0 auto; display:flex; align-items:center;">
              \${qty > 0 ? \\\`<span style="background:#10b981; color:white; font-size:11px; padding:2px 6px; border-radius:10px; margin-right:6px; font-weight:bold;">已選: \${qty}</span>\\\` : ''}
              <span style="font-weight:bold; font-size:15px; color:#1e293b;">$\${item.price}</span>
            </div>
          </div>
        \`;

        let expandedHtml = '';
        if (isExpanded) {
          const dQty = (draftCart[item.id] !== undefined) ? draftCart[item.id] : (qty || 1); 
          expandedHtml = \`
            <div class="gb-accordion-body" style="padding:12px 16px; background:#f8fafc; border-top:1px solid #e2e8f0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size:13px; color:#334155; text-align:left; flex:1;">
                  <strong>內容物：</strong>\${item.contents || '無'}
                </div>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
                  <button class="qty-btn btn-minus" style="width:36px;height:36px;font-size:18px;border:none;border-radius:50%;background:#e2e8f0;color:#334155;cursor:pointer;font-weight:bold;">-</button>
                  <span class="qty-num" style="min-width:24px;text-align:center;font-size:18px;font-weight:bold;color:#1e293b;">\${dQty}</span>
                  <button class="qty-btn btn-plus" style="width:36px;height:36px;font-size:18px;border:none;border-radius:50%;background:#10b981;color:white;cursor:pointer;font-weight:bold;">+</button>
                </div>
                <div style="display:flex; gap:8px;">
                  <button class="btn-cancel-draft" style="background:#ef4444;color:white;border:none;border-radius:6px;padding:8px 12px;font-size:13px;font-weight:bold;cursor:pointer;">❌</button>
                  <button class="btn-confirm-draft" style="background:#2563eb;color:white;border:none;border-radius:6px;padding:8px 12px;font-size:13px;font-weight:bold;cursor:pointer;">✅ 確定數量</button>
                </div>
              </div>
            </div>
          \`;
        }

        card.innerHTML = rowHtml + expandedHtml;

        const row = card.querySelector('.gb-list-row');
        row.onclick = () => {
          if (window.activeExpandedItemId === item.id) {
            window.activeExpandedItemId = null;
          } else {
            window.activeExpandedItemId = item.id;
            if (draftCart[item.id] === undefined) {
              draftCart[item.id] = currentCart[item.id] || 1; 
            }
          }
          renderItemsGrid();
        };

        if (isExpanded) {
          const btnMinus = card.querySelector('.btn-minus');
          const btnPlus = card.querySelector('.btn-plus');
          const btnConfirm = card.querySelector('.btn-confirm-draft');
          const btnCancel = card.querySelector('.btn-cancel-draft');
          
          if (btnMinus) btnMinus.onclick = (e) => {
            e.stopPropagation();
            if (draftCart[item.id] > 0) draftCart[item.id]--;
            renderItemsGrid();
          };
          
          if (btnPlus) btnPlus.onclick = (e) => {
            e.stopPropagation();
            draftCart[item.id] = (draftCart[item.id] || 0) + 1;
            renderItemsGrid();
          };

          if (btnConfirm) btnConfirm.onclick = (e) => {
            e.stopPropagation();
            if (draftCart[item.id] > 0) {
              currentCart[item.id] = draftCart[item.id];
            } else {
              delete currentCart[item.id];
            }
            delete draftCart[item.id];
            window.activeExpandedItemId = null;
            renderItemsGrid();
            updateCartBar();
            saveCartToBackend();
          };

          if (btnCancel) btnCancel.onclick = (e) => {
            e.stopPropagation();
            delete draftCart[item.id];
            window.activeExpandedItemId = null;
            renderItemsGrid();
          };
        }

        itemsContainer.appendChild(card);
      });
      catContainer.appendChild(itemsContainer);
    }
    gbItemsGrid.appendChild(catContainer);
  });
}`;

content = content.replace(regex, newCode);
fs.writeFileSync(file, content);
console.log('Patched renderItemsGrid!');
