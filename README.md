Auto ChatGPT Canvas for Obsidian
-
本插件通过监听你在 ChatGPT 网页中使用“询问 ChatGPT”（Ask ChatGPT）按钮的行为，自动记录引用链并构建可视化的思维脑图。  
A lightweight Obsidian plugin that embeds ChatGPT inside Obsidian, tracks Ask ChatGPT interactions, and automatically generates a Canvas mind-map representing parent–child relationships across your ChatGPT conversation.

<br>
  
✨ Features / 特性
-
-📌 Integrated ChatGPT browser inside the right sidebar

-🔗 Automatic relationship detection when you select text and click “Ask ChatGPT”

-🧠 Auto-generated Canvas mind-map showing conversation structure

-🗂️ Automatically creates a ChatGPT Logs folder for session data

New Feature:
Support for Alt-clicking Canvas nodes to jump directly to the corresponding message position in the ChatGPT webpage conversation.

<br>

📘 How to Use / 使用方法
-

1. Download  
Go to Releases and download the latest code.zip.

2. Install  
Unzip it into your vault:
Vault/.obsidian/plugins/Auto-ChatGPT-Canvas-for-Obsidian/

3. Enable the plugin  
  a. Open the vault in Obsidian
  b. Go to Settings → Community plugins
  c. Turn off Safe mode
  d. Click Refresh and enable the plugin

4. Open ChatGPT in sidebar  
Press Ctrl + P, type GPT, then select:  
Open ChatGPT in right sidebar  

5. Check logs  
A folder [ChatGPT Logs] will appear on the left.

6. Use normally  
Select text → click the quote button (Ask ChatGPT).  
The plugin will detect the parent–child link and update the Canvas graph.

<br>

1. 下载  
在 Releases 下载最新的 code.zip。

2. 安装  
解压到你的库目录：  
库目录/.obsidian/plugins/Auto-ChatGPT-Canvas-for-Obsidian/

3. 启用插件  
a. 打开对应 vault  
b. 前往 设置 → 第三方插件  
c. 关闭 安全模式  
d. 点击 刷新 并启用插件  

4. 打开 ChatGPT 浏览器  
按 Ctrl + P，输入 GPT，选择：  
Open ChatGPT in right sidebar

5. 查看日志文件夹  
左侧将自动生成 ChatGPT Logs 文件夹。

6. 正常使用 ChatGPT  
选中文本 → 点击文本上方的引号按钮（Ask ChatGPT），即可自动建立边关系并更新 Canvas 思维脑图。

<br>

📁 Project Structure / 项目结构
-
```md
Auto-ChatGPT-Canvas-for-Obsidian/
├── main.ts              # Core logic: message capture, Canvas mapping, orchestration
├── inject.js            # DOM hooks injected into ChatGPT tab
├── main.js              # Compiled output (generated)
├── manifest.json        # Plugin metadata
├── data.json            # Sample session data for debugging
├── styles.css           # UI adjustments for Obsidian
├── esbuild.config.mjs   # Build system config
├── tsconfig.json        # TypeScript config
└── node_modules/        # Dependencies
```
🛠️ Development & Build / 开发与构建
-
Setup
1. Copy the code file into:  
Vault/.obsidian/plugins/folder  
2. Install Node.js : <https://nodejs.org/en>  
3. intall node_modules:
```bash
npm install
```

4. Development (auto-rebuild)
```bash
npm run dev
```
5. Reload plugins in Settings → Community plugins.  

🤝 Contributing / 贡献指南
-

Contributions are welcome!  

Use short, conventional commits (e.g., feat:, fix:, refactor:)  

Include screenshots for UI or Canvas-related changes  

Follow project coding conventions (TypeScript, 2-space indent, camelCase, etc.)  

PRs should explain motivation, testing method, and steps to reproduce issues  


⚠️ Known Issues / 已知问题
-
Relationship creation may occasionally fail.  
边关系创立有时会失败。

📜 Disclaimer / 声明
-
This project contains code and logic originally generated using OpenAI Codex, and later manually reviewed, modified, and extended.  
本项目代码最初由 OpenAI Codex 生成，并在后续经过人工检查与扩展。

Use at your own risk. For research and experimentation purposes only.
