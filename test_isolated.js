
const games = [
  {
    gameId: 'game1',
    gid: 'gid1',
    date: '08/01',
    time: '19:00',
    title: '週六打球',
    sections: [{ list: ['Tony', 'Alice'] }]
  }
];

const nameToUidMap = new Map();
nameToUidMap.set('game1_Tony', 'U123');
nameToUidMap.set('game1_Alice', 'U456');

function generatePushMentionMessages(groupGames, targetGid, isMentionPush, nameToUidMap) {
      const flexBubbles = [];
      for (const g of groupGames) {
          if (flexBubbles.length >= 12) break; // LINE Carousel maximum is 12 bubbles

          const section = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 20 };
          const list = section.list || [];
          const limit = section.limit || 20;
          const backupLimit = section.backupLimit || 0;
          
          const isFull = limit > 0 && list.length >= limit;
          const statusText = isFull ? '滿團' : (limit > 0 ? `${list.length}/${limit}` : `${list.length}人`);

          // Date and location
          let infoLine = `🕒 ${g.date || ''} ${g.time || ''}`.trim();
          if (g.location) infoLine += `\n📍 ${g.location}`;

          // Format names for two columns
          const listBoxes = [];
          for (let i = 0; i < list.length && i < limit; i += 2) {
              const name1 = list[i] === '__ANON__' ? '匿名' : list[i];
              const name2 = (i + 1 < list.length && i + 1 < limit) ? (list[i+1] === '__ANON__' ? '匿名' : list[i+1]) : '';
              
              const formatName = (idx, name) => {
                  if (!name) return "";
                  const levelStr = (g.levelMap && g.levelMap[name]) ? ` (${g.levelMap[name]})` : '';
                  const paidStr = (g.paidMap && g.paidMap[name]) ? '💰' : '';
                  return `${idx+1}. ${name}${levelStr}${paidStr}`;
              };

              listBoxes.push({
                  type: "box",
                  layout: "horizontal",
                  paddingTop: "2px",
                  paddingBottom: "2px",
                  contents: [
                      { type: "text", text: formatName(i, name1), size: "xs", color: "#333333", flex: 1, wrap: false },
                      { type: "text", text: name2 ? formatName(i+1, name2) : " ", size: "xs", color: "#333333", flex: 1, wrap: false }
                  ]
              });
          }
          
          if (list.length < limit) {
              // Add an empty spot indicator for the next available spot
              listBoxes.push({
                  type: "box",
                  layout: "horizontal",
                  paddingTop: "2px",
                  paddingBottom: "2px",
                  contents: [
                      { type: "text", text: `${list.length + 1}. `, size: "xs", color: "#aaaaaa", flex: 1, wrap: false },
                      { type: "text", text: " ", size: "xs", color: "#333333", flex: 1, wrap: false }
                  ]
              });
          }

          const bodyContents = [
              { type: "text", text: infoLine, size: "xs", color: "#666666", wrap: true },
              {
                type: "box",
                layout: "horizontal",
                margin: "md",
                contents: [
                  { type: "text", text: "📝 報名狀況", size: "sm", color: "#1DB446", weight: "bold", flex: 1 },
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
                  }
                ]
              },
              { type: "separator", margin: "sm", color: "#eeeeee" },
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                contents: listBoxes
              }
          ];

          // Backups
          if (list.length > limit) {
              bodyContents.push({ type: "separator", margin: "md", color: "#eeeeee" });
              bodyContents.push({
                  type: "box",
                  layout: "horizontal",
                  margin: "md",
                  contents: [
                    { type: "text", text: "⌛ 候補名單", size: "sm", color: "#FF9800", weight: "bold", flex: 1 }
                  ]
              });
              
              const backupBoxes = [];
              let backupCount = 0;
              for (let i = limit; i < list.length; i += 2) {
                  const name1 = list[i] === '__ANON__' ? '匿名' : list[i];
                  const name2 = (i + 1 < list.length) ? (list[i+1] === '__ANON__' ? '匿名' : list[i+1]) : '';
                  
                  const formatBackup = (idx, name, bc) => {
                      if (!name) return "";
                      const levelStr = (g.levelMap && g.levelMap[name]) ? ` (${g.levelMap[name]})` : '';
                      const paidStr = (g.paidMap && g.paidMap[name]) ? '💰' : '';
                      return `候補${bc+1}. ${name}${levelStr}${paidStr}`;
                  };

                  backupBoxes.push({
                      type: "box",
                      layout: "horizontal",
                      paddingTop: "2px",
                      paddingBottom: "2px",
                      contents: [
                          { type: "text", text: formatBackup(i, name1, backupCount), size: "xs", color: "#666666", flex: 1, wrap: false },
                          { type: "text", text: name2 ? formatBackup(i+1, name2, backupCount+1) : " ", size: "xs", color: "#666666", flex: 1, wrap: false }
                      ]
                  });
                  backupCount += name2 ? 2 : 1;
              }
              bodyContents.push({
                type: "box",
                layout: "vertical",
                margin: "sm",
                contents: backupBoxes
              });
          }

          const bubble = {
              type: "bubble",
              size: "mega",
              header: {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#f5f5f5",
                  paddingAll: "lg",
                  contents: [
                      { type: "text", text: g.title, weight: "bold", size: "md", color: "#1DB446", wrap: true }
                  ]
              },
              body: {
                  type: "box",
                  layout: "vertical",
                  paddingAll: "lg",
                  contents: bodyContents
              }
          };

          const liffMainUrl = process.env.LIFF_ID ? `https://liff.line.me/${process.env.LIFF_ID}?gid=${targetGid}` : null;
          const liffGameUrl = process.env.LIFF_ID ? `${liffMainUrl}&gameId=${g.gameId}` : null;

          if (liffMainUrl && liffGameUrl) {
              bubble.footer = {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: [
                      {
                          type: "button",
                          style: "primary",
                          color: "#1DB446",
                          height: "sm",
                          flex: 1,
                          action: { type: "uri", label: "本次報名", uri: liffGameUrl }
                      },
                      {
                          type: "button",
                          style: "secondary",
                          height: "sm",
                          flex: 1,
                          action: { type: "uri", label: "進入大廳", uri: liffMainUrl }
                      }
                  ]
              };
          }

          flexBubbles.push(bubble);
      }

      const carouselMsg = {
          type: "flex",
          altText: "接龍名單",
          contents: {
              type: "carousel",
              contents: flexBubbles
          }
      };

      const messagesToSend = [carouselMsg];
      
      if (isMentionPush) {
          const uidsToMention = new Set();
          for (const g of groupGames) {
              const section = g.sections && g.sections[0] ? g.sections[0] : { list: [] };
              const list = section.list || [];
              for (const name of list) {
                  if (name !== '__ANON__') {
                      let uid = nameToUidMap.get(`${g.gameId}_${name}`);
                      if (!uid) {
                          uid = nameToUidMap.get(`${targetGid}_${name}`);
                      }
                      if (uid) {
                          uidsToMention.add(uid);
                      }
                  }
              }
          }

          const uidArray = Array.from(uidsToMention);
          if (uidArray.length > 0) {
              // LINE API text message allows max 50 mentions, and pushMessage max 5 messages.
              // We'll limit to 4 mention messages to ensure total messages (1 carousel + 4 texts) <= 5.
              for (let i = 0; i < uidArray.length && i < 200; i += 50) {
                  const chunk = uidArray.slice(i, i + 50);
                  let textMsg = "報名成功提醒：\n"; // 移除 Emoji 避免 index 計算錯誤
                  const mentionees = [];
                  
                  for (let j = 0; j < chunk.length; j++) {
                      const uid = chunk[j];
                      const placeholder = "@User";
                      mentionees.push({
                          index: textMsg.length,
                          length: placeholder.length,
                          userId: uid
                      });
                      textMsg += placeholder;
                      if (j < chunk.length - 1) {
                          textMsg += " ";
                      }
                  }

                  messagesToSend.push({
                      type: "text",
                      text: textMsg,
                      mention: {
                          mentionees: mentionees
                      }
                  });
              }
          } else {
              messagesToSend.push({
                  type: "text",
                  text: "📢 報名成功提醒：\n目前尚未紀錄到任何可標記的報名者 UID。"
              });
          }
      }

      return messagesToSend;
}

const msgs = generatePushMentionMessages(games, 'gid1', true, nameToUidMap);
console.log(JSON.stringify(msgs, null, 2));
