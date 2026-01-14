# GitHub 儲存設定指南

## 📋 設定步驟

### 步驟 1：建立 GitHub Personal Access Token

1. 前往 GitHub：https://github.com/settings/tokens
2. 點擊 **"Generate new token"** > **"Generate new token (classic)"**
3. 填寫以下資訊：
   - **Note**：`line-bot-csv-storage`（或任何你喜歡的名稱）
   - **Expiration**：選擇過期時間（建議選擇較長的時間，如 90 天或無期限）
   - **Select scopes**：勾選 **`repo`** 權限（這是最重要的！）
4. 點擊 **"Generate token"**
5. **重要**：立即複製產生的 token（格式類似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）
   - ⚠️ 這個 token 只會顯示一次，請妥善保存！

### 步驟 2：確認 GitHub 倉庫資訊

確認以下資訊：
- **GITHUB_OWNER**：你的 GitHub 使用者名稱（例如：`your-username`）
- **GITHUB_REPO**：倉庫名稱（例如：`line-bot`）
- **GITHUB_CSV_PATH**（可選）：CSV 檔案路徑，預設為 `data/registrations.csv`

### 步驟 3：在 Render 設定環境變數

1. 登入 Render Dashboard：https://dashboard.render.com
2. 選擇你的服務（Web Service）
3. 點擊左側選單的 **"Environment"**
4. 在 **"Environment Variables"** 區塊，點擊 **"Add Environment Variable"**
5. 依序新增以下環境變數：

#### 環境變數 1：GITHUB_TOKEN
- **Key**：`GITHUB_TOKEN`
- **Value**：貼上你剛才複製的 token（例如：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）
- 點擊 **"Save Changes"**

#### 環境變數 2：GITHUB_OWNER
- **Key**：`GITHUB_OWNER`
- **Value**：你的 GitHub 使用者名稱（例如：`your-username`）
- 點擊 **"Save Changes"**

#### 環境變數 3：GITHUB_REPO
- **Key**：`GITHUB_REPO`
- **Value**：倉庫名稱（例如：`line-bot`）
- 點擊 **"Save Changes"**

#### 環境變數 4（可選）：GITHUB_CSV_PATH
- **Key**：`GITHUB_CSV_PATH`
- **Value**：`data/registrations.csv`（或你想要的路徑）
- 點擊 **"Save Changes"**

#### 環境變數 5（可選）：GITHUB_BRANCH
- **Key**：`GITHUB_BRANCH`
- **Value**：`main`（或你的預設分支名稱）
- 點擊 **"Save Changes"**

### 步驟 4：重新部署服務

設定完環境變數後：
1. 在 Render Dashboard 中，點擊 **"Manual Deploy"** > **"Deploy latest commit"**
2. 或者等待自動部署（如果已啟用自動部署）
3. 部署完成後，查看日誌確認是否成功

### 步驟 5：驗證設定

部署完成後，查看啟動日誌應該會看到：
```
✅ 使用 GitHub 儲存 CSV: your-username/line-bot/data/registrations.csv
   分支: main
   Token: ghp_xxxx...
```

如果看到錯誤訊息，請檢查：
- Token 是否正確複製（沒有多餘的空格）
- Token 是否有 `repo` 權限
- 倉庫名稱和使用者名稱是否正確
- 倉庫是否存在且你有寫入權限

## 🔍 疑難排解

### 問題 1：看到 "GitHub API Error: 401"
**原因**：Token 無效或過期
**解決方法**：
- 重新建立一個新的 Token
- 確認 Token 有 `repo` 權限
- 檢查 Token 是否正確複製到環境變數

### 問題 2：看到 "GitHub API Error: 404"
**原因**：倉庫不存在或路徑錯誤
**解決方法**：
- 確認 `GITHUB_OWNER` 和 `GITHUB_REPO` 是否正確
- 確認倉庫是否存在
- 確認你有該倉庫的寫入權限

### 問題 3：看到 "⚠️ 未設定 GitHub 環境變數"
**原因**：環境變數未正確設定
**解決方法**：
- 確認所有環境變數都已設定
- 確認環境變數名稱大小寫正確（全部大寫）
- 重新部署服務

### 問題 4：Token 權限不足
**原因**：Token 沒有 `repo` 權限
**解決方法**：
- 刪除舊的 Token
- 建立新的 Token，確保勾選 `repo` 權限

## 📝 注意事項

1. **Token 安全性**：
   - 不要將 Token 提交到 Git 倉庫
   - 不要分享你的 Token
   - 如果 Token 洩露，立即刪除並建立新的

2. **倉庫權限**：
   - 確保 Token 有該倉庫的寫入權限
   - 如果是組織的倉庫，可能需要組織管理員授權

3. **檔案路徑**：
   - CSV 檔案會自動建立，不需要手動建立
   - 如果路徑不存在，GitHub 會自動建立資料夾結構

4. **降級機制**：
   - 如果 GitHub 寫入失敗，系統會自動降級到本地檔案模式
   - 資料不會丟失，但不會同步到 GitHub

## ✅ 完成後

設定完成後，報名資料會自動儲存到 GitHub 倉庫的 CSV 檔案中。你可以：
- 在 GitHub 上查看報名記錄
- 使用 Git 版本控制追蹤變更
- 即使服務器重啟，資料也不會丟失
