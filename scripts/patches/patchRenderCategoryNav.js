const fs = require('fs');
const file = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /function renderCategoryNav\(\) \{[\s\S]*?(?=\n\}\n\nwindow\.expandedCategories)/;

const newCode = `window.showAllCategories = false;

function renderCategoryNav() {
  if (!gbCategoryNav || !currentGroupBuyData) return;
  const allCategories = ['全部', '🌟 已選購'];
  if (Array.isArray(currentGroupBuyData.items)) {
    currentGroupBuyData.items.forEach(item => {
      if (item.category && !allCategories.includes(item.category)) {
        allCategories.push(item.category);
      }
    });
  }

  const mainCategories = ['全部', '🌟 已選購', '堅果類', '蔬果系列', '果乾系列'];
  const otherCategories = allCategories.filter(cat => !mainCategories.includes(cat));

  gbCategoryNav.innerHTML = '';
  
  function createCatBtn(cat) {
    const btn = document.createElement('button');
    btn.className = \`gb-cat-btn \${cat === activeCategoryFilter ? 'active' : ''}\`;
    btn.innerText = cat;
    btn.onclick = () => {
      activeCategoryFilter = cat;
      renderCategoryNav();
      renderItemsGrid();
      updateCartBar();
    };
    gbCategoryNav.appendChild(btn);
  }

  mainCategories.forEach(cat => {
    if (allCategories.includes(cat)) {
      createCatBtn(cat);
    }
  });

  if (window.showAllCategories) {
    otherCategories.forEach(cat => {
      createCatBtn(cat);
    });
  }

  if (otherCategories.length > 0) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'gb-cat-btn';
    toggleBtn.style.cssText = 'background: #f1f5f9; color: #475569; border: 1px dashed #cbd5e1; font-weight: bold; margin-left: 8px;';
    toggleBtn.innerText = window.showAllCategories ? '收起分類 ▲' : '更多分類 ▼';
    toggleBtn.onclick = () => {
      window.showAllCategories = !window.showAllCategories;
      renderCategoryNav();
    };
    gbCategoryNav.appendChild(toggleBtn);
  }
}`;

content = content.replace(regex, newCode);
fs.writeFileSync(file, content);
console.log('Patched renderCategoryNav!');
