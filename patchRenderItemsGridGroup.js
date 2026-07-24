const fs = require('fs');
const file = 'c:/Users/tony.hsieh/Desktop/TonysData/TonysBadmintion/public/app.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /gbItemsGrid\.style\.display = 'grid';\s+gbItemsGrid\.style\.gridTemplateColumns = 'repeat\(auto-fill, minmax\(280px, 1fr\)\)';\s+gbItemsGrid\.style\.gap = '8px';\s+gbItemsGrid\.style\.alignItems = 'start';\s+filtered\.forEach\(item => \{\s+const card = document\.createElement\('div'\);([\s\S]*?)gbItemsGrid\.appendChild\(card\);\s+\}\);/m;

const match = content.match(regex);
if (!match) {
  console.log('No match found!');
  process.exit(1);
}

const cardInnerCode = match[1];

const replacement = `
  const createItemCard = (item) => {
    const card = document.createElement('div');
${cardInnerCode}
    return card;
  };

  const isAllView = (activeCategoryFilter === '全部' && (!currentSearchQuery || currentSearchQuery.trim() === ''));

  if (!isAllView) {
    gbItemsGrid.style.display = 'grid';
    gbItemsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    gbItemsGrid.style.gap = '8px';
    gbItemsGrid.style.alignItems = 'start';
    
    filtered.forEach(item => {
      gbItemsGrid.appendChild(createItemCard(item));
    });
  } else {
    gbItemsGrid.style.display = 'block';
    
    const groups = {};
    filtered.forEach(item => {
      const cat = item.category || '未分類';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    
    const primaryCategories = ['堅果類', '蔬果系列', '果乾系列'];
    const sortedCats = Object.keys(groups).sort((a, b) => {
      const idxA = primaryCategories.indexOf(a);
      const idxB = primaryCategories.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    sortedCats.forEach(cat => {
      const groupDiv = document.createElement('div');
      groupDiv.style.marginBottom = '24px';
      groupDiv.style.background = 'transparent';
      
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:16px; font-weight:bold; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:8px;';
      titleEl.innerHTML = \`<span style="width:4px; height:18px; background:#10b981; border-radius:2px; display:inline-block;"></span>\${cat}\`;
      groupDiv.appendChild(titleEl);
      
      const gridDiv = document.createElement('div');
      gridDiv.style.display = 'grid';
      gridDiv.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
      gridDiv.style.gap = '8px';
      gridDiv.style.alignItems = 'start';
      
      groups[cat].forEach(item => {
        gridDiv.appendChild(createItemCard(item));
      });
      
      groupDiv.appendChild(gridDiv);
      gbItemsGrid.appendChild(groupDiv);
    });
  }
`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched successfully!');
