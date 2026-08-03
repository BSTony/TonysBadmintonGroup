const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

const generateStatusBubbleCode = `
function generateStatusBubble(targetGames, liffBaseUrl, cleanText, isPlusMinus) {
  const flexContents = [];
  targetGames.forEach((g, index) => {
    if (index >= 15) return;
    const sec = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 0 };
    const count = sec.list.length;
    const limit = sec.limit || 0;
    const isFull = limit > 0 && count >= limit;
    const statusText = isFull ? '滿團' : (limit > 0 ? \`\${count}/\${limit}\` : \`\${count}人\`);
    const titleText = g.title || g.date || '場次';
    
    let combinedTitle = titleText;
    if (g.date && g.date !== g.title) {
      const shortDate = g.date.replace(/\\s*[（\\(].*?[)）]\\s*/g, '').trim();
      if (shortDate) {
        combinedTitle = \`\${shortDate} \${titleText}\`;
      }
    }

    const isTarget = isPlusMinus && g.title && g.title.length > 1 && cleanText && cleanText.includes(g.title);

    const rowContents = [
      { type: "text", text: isTarget ? \`🔥 \${combinedTitle}\` : combinedTitle, size: "xs", color: "#333333", flex: 4, wrap: false, weight: isTarget ? "bold" : "regular" },
      {
        type: "box",
        layout: "horizontal",
        flex: 0,
        height: "22px",
        width: isFull ? "36px" : "48px",
        cornerRadius: "sm",
        backgroundColor: isFull ? "#ffebee" : "#e8f5e9",
        justifyContent: "center",
        alignItems: "center",
        contents: [
          { type: "text", text: statusText, size: "xxs", color: isFull ? "#ff4c4c" : "#1DB446", align: "center", weight: "bold" }
        ]
      },
      { type: "text", text: "〉", size: "sm", color: "#cccccc", flex: 0, margin: "sm", gravity: "center" }
    ];

    const rowBox = {
      type: "box",
      layout: "horizontal",
      paddingTop: "8px",
      paddingBottom: "8px",
      paddingStart: isTarget ? "10px" : "4px",
      paddingEnd: "4px",
      alignItems: "center",
      action: { type: "uri", label: "查看名單", uri: \`\${liffBaseUrl}&gameId=\${g.gameId}\` },
      contents: rowContents
    };

    if (isTarget) {
      rowBox.backgroundColor = "#FFF3CD";
      rowBox.cornerRadius = "md";
    }

    if (index > 0 && !isTarget) {
      flexContents.push({ type: "separator", color: "#f4f4f4" });
    }
    if (index > 0 && isTarget) {
      flexContents.push({ type: "box", layout: "vertical", height: "4px", contents: [{ type: "filler" }] });
    }

    flexContents.push(rowBox);

    if (isTarget) {
      flexContents.push({ type: "box", layout: "vertical", height: "4px", contents: [{ type: "filler" }] });
    }
  });

  flexContents.push({
    type: "box",
    layout: "horizontal",
    margin: "lg",
    justifyContent: "center",
    contents: [
      { type: "text", text: "點選上方場次查看詳細名單 👆", size: "xs", color: "#888888", align: "center" }
    ]
  });

  if (isPlusMinus && cleanText !== '+1' && cleanText !== '-1') {
    flexContents.push({
      type: "box",
      layout: "horizontal",
      margin: "md",
      paddingAll: "10px",
      backgroundColor: "#e8f5e9",
      cornerRadius: "md",
      alignItems: "center",
      contents: [
        { type: "text", text: "🔔 最新通知", size: "xs", weight: "bold", color: "#1DB446", flex: 0 },
        { type: "text", text: cleanText, size: "xs", color: "#333333", wrap: true, margin: "sm", flex: 1 }
      ]
    });
  }

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingBottom: "none",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            { type: "text", text: "🏸 羽球接龍大廳", weight: "bold", size: "md", color: "#1DB446", flex: 1 },
            {
              type: "button",
              style: "primary",
              color: "#1DB446",
              height: "sm",
              flex: 0,
              action: { type: "uri", label: "進入大廳", uri: liffBaseUrl }
            }
          ]
        },
        { type: "separator", margin: "md", color: "#eeeeee" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: flexContents
    }
  };
}
`;

// Insert the generateStatusBubbleCode before generatePushMentionMessages
code = code.replace(/function generatePushMentionMessages\(/, generateStatusBubbleCode + '\nfunction generatePushMentionMessages(');

// Update generatePushMentionMessages signature and logic
code = code.replace(/function generatePushMentionMessages\(groupGames, targetGid, isMentionPush, nameToUidMap\)/, 'function generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap, statusBubble)');
code = code.replace(/const flexBubbles = \[\];/, 'const flexBubbles = statusBubble ? [statusBubble] : [];');
code = code.replace(/for \(const g of groupGames\) \{/, 'for (const g of groupGames) {\n          if (flexBubbles.length >= 12) break;');

// We need to replace two blocks in handleMessageEvent:
// 1. the 推播提醒 block
let pStart = code.indexOf("if (text.startsWith('接龍名單') || text.startsWith('推播提醒')) {");
let pEnd = code.indexOf("if (text === '超級清空') {", pStart);
let pBlock = code.substring(pStart, code.lastIndexOf("}", code.lastIndexOf("}", pEnd) - 1) + 1);

// 2. the 接龍狀況 block
let sStart = code.indexOf("if (text === '接龍狀況' || text === '接龍狀態' || isPlusMinus) {");
let sEnd = code.indexOf("} catch (e) {", sStart);
let sBlock = code.substring(sStart, code.lastIndexOf("}", sEnd - 1) + 1);

// Remove the sBlock entirely
code = code.replace(sBlock, "");

// Replace pBlock with our unified block
const replacement = `
    if (text.startsWith('接龍名單') || text.startsWith('推播提醒') || text === '接龍狀況' || text === '接龍狀態' || text === '接龍查詢' || isPlusMinus) {
      const isMentionPush = text.startsWith('推播提醒');
      
      if (isMentionPush && !isAdmin) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '❌ 只有管理員可以使用「推播提醒」功能喔！' });
      }

      const groupMatch = text.match(/群組(?:[:：])?\\s*(?:\\{|｛)(.*?)(?:\\}|｝)/) || text.match(/群組[:：]\\s*(\\d{4})/);
      let targetGid = gid;
      if (groupMatch) {
          const code = groupMatch[1].trim();
          if (groupCodes[code]) {
              targetGid = groupCodes[code];
          } else {
              return client.replyMessage(event.replyToken, { type: 'text', text: \`找不到代碼為 \${code} 的群組。\` });
          }
      }

      let keyword = text.replace(/接龍名單/, '').replace(/推播提醒/, '').replace(/接龍狀況/, '').replace(/接龍狀態/, '').replace(/接龍查詢/, '');
      if (groupMatch) keyword = keyword.replace(groupMatch[0], '');
      keyword = keyword.replace(/\\[系統代發\\]/g, '').trim();
      if (isPlusMinus) keyword = '';
      
      const getGameTime = (g) => {
        let t = 0;
        if (g.date) {
          let dStr = g.date.trim();
          if (dStr.match(/^\\d{1,2}\\/\\d{1,2}$/)) {
            dStr = new Date().getFullYear() + '/' + dStr;
          }
          const pd = new Date(\`\${dStr} \${g.time || ''}\`.trim());
          if (!isNaN(pd.getTime())) t = pd.getTime();
        }
        return t === 0 ? (g.startTime || 0) : t;
      };

      let groupGames = Object.values(games)
        .filter(g => (g.gid === targetGid || (g.targetGids && g.targetGids.includes(targetGid))) && g.active && !g.isManualEnded)
        .sort((a, b) => getGameTime(a) - getGameTime(b));
      
      if (keyword) {
          groupGames = groupGames.filter(g => g.title.includes(keyword));
      }
      
      if (groupGames.length === 0) {
          const emptyText = keyword ? \`找不到包含「\${keyword}」的場次喔！\` : \`目前群組內沒有正在進行的場次喔！\`;
          return client.replyMessage(event.replyToken, { type: 'text', text: emptyText });
      }

      const liffBaseUrl = process.env.LIFF_ID ? \`https://liff.line.me/\${process.env.LIFF_ID}?gid=\${targetGid}\` : null;
      if (!liffBaseUrl) {
        return client.replyMessage(event.replyToken, { type: 'text', text: '尚未設定大廳網址 (LIFF_ID)' });
      }

      // Generate the status summary bubble
      const statusBubble = generateStatusBubble(groupGames, liffBaseUrl, cleanText, isPlusMinus);

      // Generate the full carousel (Status Bubble + Detail Bubbles + Mentions)
      const messagesToSend = generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap, statusBubble);
      
      // We NEVER consume quota for standard replies!
      // Only when explicitly pushing to a DIFFERENT group do we use pushMessage.
      if (targetGid !== gid) {
          try {
              await client.pushMessage(targetGid, messagesToSend);
              const successMsg = isMentionPush ? '場次名單及提醒' : '場次名單';
              return client.replyMessage(event.replyToken, { type: 'text', text: \`✅ 已將\${successMsg}推播至群組 \${groupMatch ? groupMatch[1].trim() : targetGid}\` });
          } catch (e) {
              console.error('Push message failed:', e.originalError?.response?.data || e);
              const errDetail = JSON.stringify(e.originalError?.response?.data || e.message);
              return client.replyMessage(event.replyToken, { type: 'text', text: \`❌ 推播失敗，錯誤內容：\\n\${errDetail}\` }).catch(()=>null);
          }
      } else {
          try {
              // Same group => Use replyMessage (FREE!)
              return await client.replyMessage(event.replyToken, messagesToSend);
          } catch (e) {
              console.error('Reply message failed:', e.originalError?.response?.data || e);
              const errDetail = JSON.stringify(e.originalError?.response?.data || e.message);
              // Only fallback to pushMessage if reply fails for some strict LINE payload reasons
              return client.pushMessage(gid, { type: 'text', text: \`❌ 發送失敗，發生異常錯誤：\\n\${errDetail}\` }).catch(()=>null);
          }
      }
    }
`;

code = code.replace(pBlock, replacement);

fs.writeFileSync('index.js', code);
