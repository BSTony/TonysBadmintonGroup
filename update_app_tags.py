import sys

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# renderLobby modification
old_card_inner = """    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="card-header" style="cursor: pointer" onclick="showDetail('${game.gameId}')">
        <div class="card-title">${escapeHTML(game.title)}</div>
        <div class="card-badge ${isFull ? 'full' : ''}">${count} / ${limit}</div>
      </div>
      <div class="card-actions">"""

new_card_inner = """    const hasTags = game.date || game.time || game.location || game.fee;
    let tagsHtml = '';
    if (hasTags) {
       tagsHtml = '<div class="info-tags" style="cursor: pointer" onclick="showDetail(\\'' + game.gameId + '\\')">';
       if (game.date) tagsHtml += `<span class="info-tag">📅 ${escapeHTML(game.date)}</span>`;
       if (game.time) tagsHtml += `<span class="info-tag">⏰ ${escapeHTML(game.time)}</span>`;
       if (game.location) tagsHtml += `<span class="info-tag">📍 ${escapeHTML(game.location)}</span>`;
       if (game.fee) tagsHtml += `<span class="info-tag">💰 ${escapeHTML(game.fee)}</span>`;
       tagsHtml += '</div>';
    }

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="card-header" style="cursor: pointer" onclick="showDetail('${game.gameId}')">
        <div class="card-title">${escapeHTML(game.title)}</div>
        <div class="card-badge ${isFull ? 'full' : ''}">${count} / ${limit}</div>
      </div>
      ${tagsHtml}
      ${game.note ? `<div class="game-note" style="cursor: pointer" onclick="showDetail('${game.gameId}')">${escapeHTML(game.note)}</div>` : ''}
      <div class="card-actions">"""

if old_card_inner in content:
    content = content.replace(old_card_inner, new_card_inner)
    print("Replaced renderLobby")

# renderDetail modification
old_detail_inner = """  detailTitle.innerText = game.title;
  
  const section = game.sections[0] || { list: [], limit: 20 };
  detailCount.innerText = `${section.list.length} / ${section.limit}`;
  
  detailList.innerHTML = '';"""

new_detail_inner = """  detailTitle.innerText = game.title;
  
  const section = game.sections[0] || { list: [], limit: 20 };
  detailCount.innerText = `${section.list.length} / ${section.limit}`;
  
  detailList.innerHTML = '';
  
  const hasTags = game.date || game.time || game.location || game.fee;
  if (hasTags) {
     let tagsHtml = '<div class="info-tags">';
     if (game.date) tagsHtml += `<span class="info-tag">📅 ${escapeHTML(game.date)}</span>`;
     if (game.time) tagsHtml += `<span class="info-tag">⏰ ${escapeHTML(game.time)}</span>`;
     if (game.location) tagsHtml += `<span class="info-tag">📍 ${escapeHTML(game.location)}</span>`;
     if (game.fee) tagsHtml += `<span class="info-tag">💰 ${escapeHTML(game.fee)}</span>`;
     tagsHtml += '</div>';
     detailList.innerHTML += tagsHtml;
  }
  if (game.note) {
     detailList.innerHTML += `<div class="game-note">${escapeHTML(game.note)}</div>`;
  }"""

if old_detail_inner in content:
    content = content.replace(old_detail_inner, new_detail_inner)
    print("Replaced renderDetail")

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
