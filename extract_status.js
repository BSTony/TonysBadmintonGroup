const flexContents = [];

      targetGames.forEach((g, index) => {
        if (index >= 15) return;
        const sec = g.sections && g.sections[0] ? g.sections[0] : { list: [], limit: 0 };
        const count = sec.list.length;
        const limit = sec.limit || 0;
        const isFull = limit > 0 && count >= limit;
        const statusText = isFull ? '滿團' : (limit > 0 ? `${count}/${limit}` : `${count}人`);
        const titleText = g.title || g.date || '場次';
        
        let combinedTitle = titleText;
        if (g.date && g.date !== g.title) {
          const shortDate = g.date.replace(/\s*[（\(].*?[)）]\s*/g, '').trim();
          if (shortDate) {
            combinedTitle = `${shortDate} ${titleText}`;
          }
        }

        const isTarget = isPlusMinus && g.title && g.title.length > 1 && cleanText.includes(g.title);

        // 每一列的容器
        const rowContents = [
          { type: "text", text: isTarget ? `🔥 ${combinedTitle}` : combinedTitle, size: "xs", color: "#333333", flex: 4, wrap: false, weight: isTarget ? "bold" : "regular" },
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
          action: { type: "uri", label: "查看名單", uri: `${liffBaseUrl}&gameId=${g.gameId}` },
          contents: rowContents
        };

        if (isTarget) {
          rowBox.backgroundColor = "#FFF3CD";
          rowBox.cornerRadius = "md";
        }

        // 分隔線（第一項之後才加）
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

      // 在最下方加入一次性的提示文字
      flexContents.push({
        type: "box",
        layout: "horizontal",
        margin: "lg",
        justifyContent: "center",
        contents: [
          { type: "text", text: "點選上方場次查看詳細名單 👆", size: "xs", color: "#888888", align: "center" }
        ]
      });

      // 如果這是由 LIFF 系統發送的操作通知
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

      const flexMessage = {
        type: "flex",
        altText: "目前接龍狀況",
        contents: {
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
        }
      };

      