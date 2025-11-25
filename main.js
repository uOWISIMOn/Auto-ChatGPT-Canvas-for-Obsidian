var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GptCanvasPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_CHATGPT = "gptcanvas-chatgpt-view";
var LOG_ROOT = "ChatGPT Logs";
var DEFAULT_LAYOUT = {
  nodeWidth: 420,
  minNodeHeight: 96,
  maxNodeHeight: 520,
  baseLineHeight: 18,
  charsPerLine: 36,
  verticalGap: 88,
  horizontalGap: 48,
  startX: 160,
  startY: 120,
  refWidth: 340,
  refHeight: 140,
  // A2B2C1: 次轴固定高度
  refGap: 16,
  refColumnGap: 32
};
var DEFAULT_SETTINGS = {
  chatgptUrl: "https://chatgpt.com",
  autoCreateCanvas: true,
  enableDevtools: false,
  layout: DEFAULT_LAYOUT,
  sessionFolders: {}
};
var GptCanvasPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.currentSessionId = "default";
    this.activeRoundId = 0;
    this.nextRoundId = 0;
  }
  async onload() {
    await this.loadSettings();
    await this.ensureFolder(LOG_ROOT);
    this.registerView(VIEW_TYPE_CHATGPT, (leaf) => new ChatGPTView(leaf, this));
    this.addCommand({
      id: "open-chatgpt-sidebar",
      name: "Open ChatGPT in right sidebar",
      callback: () => this.openChatGPTInSidebar()
    });
    this.addCommand({
      id: "open-chatgpt-webview-devtools",
      name: "Open ChatGPT webview DevTools",
      callback: () => this.openDevtoolsForChatGPTView()
    });
    this.addCommand({
      id: "dump-chatgpt-dom",
      name: "Dump ChatGPT DOM to file",
      callback: () => this.dumpChatGPTDom()
    });
    this.addSettingTab(new GptCanvasSettingTab(this.app, this));
  }
  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATGPT).forEach((l) => l.detach());
  }
  async loadSettings() {
    const saved = await this.loadData() || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});
    this.settings.layout = Object.assign({}, DEFAULT_LAYOUT, saved.layout || {});
    this.settings.sessionFolders = Object.assign({}, saved.sessionFolders || {});
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /** ========= 侧栏 & DevTools ========= */
  async openChatGPTInSidebar() {
    const right = this.app.workspace.getRightLeaf(false) || this.app.workspace.getRightLeaf(true);
    if (!right) {
      new import_obsidian.Notice("Cannot get right sidebar leaf");
      return;
    }
    await right.setViewState({ type: VIEW_TYPE_CHATGPT, active: true });
    this.app.workspace.revealLeaf(right);
  }
  getChatGPTView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATGPT);
    if (!leaves.length) return null;
    return leaves[0].view;
  }
  async openDevtoolsForChatGPTView() {
    const view = this.getChatGPTView();
    if (!view) return new import_obsidian.Notice("No ChatGPT view open");
    view.openDevtools();
  }
  async dumpChatGPTDom() {
    const view = this.getChatGPTView();
    if (!view) return new import_obsidian.Notice("No ChatGPT view open");
    await view.dumpDomToFile();
    new import_obsidian.Notice("DOM dumped: ChatGPT Logs/<sessionId>/dom.html");
  }
  /** ========= Session / 文件路径 ========= */
  getSessionIdFromUrl(url) {
    if (!url) return "default";
    const m = url.match(/\/c\/([\w-]+)/);
    return m && m[1] ? m[1] : "default";
  }
  async setSessionFromUrl(url) {
    const id = this.getSessionIdFromUrl(url);
    if (id === this.currentSessionId) return;
    this.currentSessionId = id;
    await this.ensureFolder(LOG_ROOT);
  }
  getSessionPaths() {
    const folderName = this.getSessionFolderName(this.currentSessionId);
    const base = `${LOG_ROOT}/${folderName}`;
    return {
      folder: (0, import_obsidian.normalizePath)(base),
      jsonPath: (0, import_obsidian.normalizePath)(`${base}/session.json`),
      domPath: (0, import_obsidian.normalizePath)(`${base}/dom.html`),
      canvasPath: (0, import_obsidian.normalizePath)(`${base}/chatgpt-session.canvas`)
    };
  }
  async ensureFolder(path) {
    const p = (0, import_obsidian.normalizePath)(path);
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(p)) await adapter.mkdir(p);
  }
  async readSession() {
    const { jsonPath } = this.getSessionPaths();
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(jsonPath)) return { messages: [], links: [] };
    try {
      const raw = await adapter.read(jsonPath);
      const data = JSON.parse(raw);
      if (!Array.isArray(data.messages)) data.messages = [];
      if (!Array.isArray(data.links)) data.links = [];
      return {
        messages: data.messages,
        links: data.links,
        sessionUrl: data.sessionUrl
      };
    } catch (e) {
      console.error("[gptCanvas] readSession error:", e);
      return { messages: [], links: [] };
    }
  }
  async writeSession(data) {
    const firstUser = data.messages.find((m) => m.role === "user");
    const firstAny = data.messages[0];
    const ts = firstUser?.ts ?? firstAny?.ts ?? Date.now();
    const base = this.ensureSessionFolderForTimestamp(this.currentSessionId, ts);
    const folder = (0, import_obsidian.normalizePath)(base);
    const jsonPath = (0, import_obsidian.normalizePath)(`${base}/session.json`);
    await this.ensureFolder(folder);
    await this.app.vault.adapter.write(jsonPath, JSON.stringify(data, null, 2));
  }
  /** ========= 工具函数 ========= */
  computeNodeSize(text, widthOverride) {
    const l = this.settings.layout;
    const width = widthOverride ?? l.nodeWidth;
    const plain = text.replace(/\r/g, "");
    const hard = plain.split("\n").length;
    const soft = Math.ceil(plain.replace(/\n/g, "").length / Math.max(l.charsPerLine, 12));
    const lines = Math.max(hard, soft, 1);
    const raw = lines * l.baseLineHeight + 28;
    const height = Math.max(l.minNodeHeight, Math.min(raw, l.maxNodeHeight));
    return { width, height };
  }
  truncateMd(md, maxChars = 180) {
    const s = (md || "").replace(/\n{3,}/g, "\n\n").trim();
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + " \u2026";
  }
  pad2(num) {
    return num.toString().padStart(2, "0");
  }
  formatCanvasTimestamp(ts) {
    const d = new Date(ts);
    const yy = this.pad2(d.getFullYear() % 100);
    const mm = this.pad2(d.getMonth() + 1);
    const dd = this.pad2(d.getDate());
    const hh = this.pad2(d.getHours());
    const mi = this.pad2(d.getMinutes());
    const ss = this.pad2(d.getSeconds());
    return `[${yy}/${mm}/${dd}][${hh}:${mi}:${ss}]`;
  }
  formatSessionFolderName(ts) {
    const stamp = this.formatCanvasTimestamp(ts);
    return stamp.replace(/\//g, "-").replace(/:/g, "-");
  }
  getSessionFolderName(sessionId) {
    if (!this.settings.sessionFolders) this.settings.sessionFolders = {};
    return this.settings.sessionFolders[sessionId] || sessionId;
  }
  ensureSessionFolderForTimestamp(sessionId, ts) {
    if (!this.settings.sessionFolders) this.settings.sessionFolders = {};
    let folder = this.settings.sessionFolders[sessionId];
    if (!folder) {
      folder = this.formatSessionFolderName(ts);
      this.settings.sessionFolders[sessionId] = folder;
      this.saveSettings().catch(() => {
      });
    }
    return `${LOG_ROOT}/${folder}`;
  }
  logWithRound(category, message, ...args) {
    const round = this.activeRoundId;
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    console.log(`[${round}] ${ts}
  [${category}] ${message}`, ...args);
  }
  logLifecycle(message, ...args) {
    this.logWithRound("LIFECYCLE", message, ...args);
  }
  logSession(message, ...args) {
    this.logWithRound("SESSION", message, ...args);
  }
  logCanvas(message, ...args) {
    return;
  }
  logDebug(message, ...args) {
    if (!this.settings.enableDevtools) return;
    this.logWithRound("DEBUG", message, ...args);
  }
  startRound() {
    this.activeRoundId = this.nextRoundId;
    this.syncRoundToWebview(this.activeRoundId);
  }
  completeRound() {
    this.nextRoundId += 1;
    this.activeRoundId = this.nextRoundId;
    this.syncRoundToWebview(this.activeRoundId);
  }
  /** 按 seq 生成 Q/A turn：user 与其后最近的 assistant 配成一对 */
  buildTurns(messages) {
    const sorted = [...messages].sort((a, b) => a.seq - b.seq);
    const turns = [];
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      if (m.role === "user") {
        let a;
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[j].role === "assistant") {
            a = sorted[j];
            break;
          }
          if (sorted[j].role === "user") break;
        }
        turns.push({ q: m, a, parentId: m.parentId });
      }
    }
    return turns;
  }
  getTurnLabel(turn) {
    const seq = typeof turn.q.seq === "number" ? turn.q.seq : 1;
    const round = Math.ceil(Math.max(seq, 1) / 2);
    return `${round}`;
  }
  ensureUniqueLink(links, newLink) {
    const exists = links.find((l) => l.from === newLink.from && l.to === newLink.to && l.type === newLink.type);
    if (!exists) links.push(newLink);
  }
  syncRoundToWebview(round) {
    const view = this.getChatGPTView();
    if (!view) return;
    view.setRound(round);
  }
  /** ========= 应用快照（合并存储，不清空） ========= */
  async applySnapshot(payload) {
    await this.setSessionFromUrl(payload.url);
    const prev = await this.readSession();
    const byId = /* @__PURE__ */ new Map();
    for (const m of prev.messages) byId.set(m.id, { ...m });
    const snapMsgs = payload.messages || [];
    let seq = 1;
    for (let i = 0; i < snapMsgs.length; i++) {
      const s = snapMsgs[i];
      const text = (s.text || "").trim();
      if (!text) continue;
      const role = s.role === "user" ? "user" : "assistant";
      const id = s.domId || `auto-${role}-${i}`;
      const exist = byId.get(id);
      if (exist) {
        exist.role = role;
        exist.text = text;
        exist.seq = seq++;
        if (!exist.ts) exist.ts = Date.now();
      } else {
        byId.set(id, { id, domId: id, role, text, seq: seq++, ts: Date.now() });
      }
    }
    const mergedMessages = Array.from(byId.values());
    mergedMessages.sort((a, b) => a.seq - b.seq);
    const mergedLinks = Array.isArray(prev.links) ? [...prev.links] : [];
    if (payload.reason === "user-send") {
      this.startRound();
    }
    const selectionText = payload.selection && payload.selection.text ? payload.selection.text.trim() : "";
    if (payload.reason === "user-send" && payload.selection?.domId && selectionText) {
      const fromId = payload.selection.domId;
      const latestUser = [...mergedMessages].filter((m) => m.role === "user").sort((a, b) => b.seq - a.seq)[0];
      if (fromId && latestUser && latestUser.id !== fromId) {
        const link = {
          from: fromId,
          to: latestUser.id,
          type: "ref",
          refText: this.truncateMd(selectionText, 200),
          ts: Date.now()
        };
        this.ensureUniqueLink(mergedLinks, link);
        const parent = byId.get(fromId);
        if (parent) {
          latestUser.parentId = parent.id;
          this.logSession(`[gptCanvas] \u{1F501} ref link recorded: from=${parent.id}, to=${latestUser.id}`);
        }
      }
    }
    const sessionUrl = payload.url || prev.sessionUrl;
    const data = { messages: mergedMessages, links: mergedLinks, sessionUrl };
    await this.writeSession(data);
    if (this.settings.autoCreateCanvas) {
      await this.updateCanvasFromSession(data);
    }
    if (payload.reason === "user-send") {
      this.completeRound();
    }
  }
  /** ========= 生成 Canvas =========
   * 主轴：Q/A 横向配对；行高为 max(Q, A, 次轴堆叠高度)
   * 次轴：对指向本行 Q 的所有引用链接，右侧生成 refQ/refA 小卡，固定高度，垂直堆叠
   */
  async updateCanvasFromSession(data) {
    const { folder, canvasPath } = this.getSessionPaths();
    await this.ensureFolder(folder);
    const adapter = this.app.vault.adapter;
    const L = this.settings.layout;
    const nodes = [];
    const edges = [];
    const byId = /* @__PURE__ */ new Map();
    for (const m of data.messages) byId.set(m.id, m);
    const turns = this.buildTurns(data.messages);
    const turnByUserId = /* @__PURE__ */ new Map();
    for (const turn of turns) {
      turnByUserId.set(turn.q.id, turn);
    }
    for (const link of data.links) {
      if (link.type !== "ref") continue;
      const child = turnByUserId.get(link.to);
      if (child) {
        child.parentId = link.from;
      }
    }
    const childTurnsByParent = /* @__PURE__ */ new Map();
    for (const turn of turns) {
      if (turn.parentId) {
        const arr = childTurnsByParent.get(turn.parentId) || [];
        arr.push(turn);
        childTurnsByParent.set(turn.parentId, arr);
      }
    }
    for (const arr of childTurnsByParent.values()) {
      arr.sort((a, b) => a.q.seq - b.q.seq);
    }
    const layoutTurn = (turn, baseX, baseY, qWidth, aWidth, _childColumnStartX, columnIndex) => {
      const label = this.getTurnLabel(turn);
      const qFull = `Q #${label}
${turn.q.text}`;
      const qSize = this.computeNodeSize(qFull, qWidth);
      const aX2 = baseX + qWidth + L.horizontalGap;
      let rowHeight = qSize.height;
      nodes.push({
        id: turn.q.id,
        type: "text",
        x: baseX,
        y: baseY,
        width: qWidth,
        height: qSize.height,
        text: qFull,
        color: "4"
      });
      if (turn.a) {
        const aHeader = `A #${label}`;
        const aFull = `${aHeader}
${turn.a.text}`;
        const aSize = this.computeNodeSize(aFull, aWidth);
        nodes.push({
          id: turn.a.id,
          type: "text",
          x: aX2,
          y: baseY,
          width: aWidth,
          height: aSize.height,
          text: aFull,
          color: "3"
        });
        rowHeight = Math.max(rowHeight, aSize.height);
      }
      const parentRightX = turn.a ? aX2 + aWidth : baseX + qWidth;
      const parentId = turn.a ? turn.a.id : turn.q.id;
      const children = childTurnsByParent.get(parentId) || [];
      let childrenHeight = 0;
      if (children.length > 0) {
        const childX = parentRightX + L.refColumnGap;
        let childY = baseY;
        let maxBottom = baseY;
        for (const child of children) {
          const childColumnWidth = L.refWidth;
          const childConsumed = layoutTurn(
            child,
            childX,
            childY,
            childColumnWidth,
            childColumnWidth,
            childX + childColumnWidth + L.horizontalGap + L.refColumnGap,
            columnIndex + 1
          );
          const childBottom = childY + childConsumed;
          if (childBottom > maxBottom) maxBottom = childBottom;
          childY = childBottom + L.verticalGap;
        }
        childrenHeight = maxBottom - baseY;
      }
      return Math.max(rowHeight, childrenHeight);
    };
    const aX = L.startX + L.nodeWidth + L.horizontalGap;
    const childColumnStart = aX + L.nodeWidth + L.refColumnGap;
    const firstRoot = turns.find((turn) => !turn.parentId);
    const firstTimestamp = firstRoot?.q.ts ?? firstRoot?.a?.ts ?? Date.now();
    const canvasTitle = this.formatCanvasTimestamp(firstTimestamp);
    if (firstRoot) {
      const infoText = `Session: ${data.sessionUrl || "unknown"}
${canvasTitle}`;
      const infoWidth = L.nodeWidth;
      const infoSize = this.computeNodeSize(infoText, infoWidth);
      const infoX = L.startX - infoWidth - L.horizontalGap;
      nodes.push({
        id: `info_${this.currentSessionId}`,
        type: "text",
        x: infoX,
        y: L.startY,
        width: infoWidth,
        height: infoSize.height,
        text: infoText,
        color: "2"
      });
    }
    let cursorY = L.startY;
    for (const turn of turns.filter((t) => !t.parentId)) {
      const consumed = layoutTurn(
        turn,
        L.startX,
        cursorY,
        L.nodeWidth,
        L.nodeWidth,
        childColumnStart,
        0
      );
      cursorY += consumed + L.verticalGap;
    }
    for (const link of data.links) {
      if (link.type !== "ref") continue;
      const child = turnByUserId.get(link.to);
      if (!child) continue;
      const targetId = child.a ? child.a.id : child.q.id;
      edges.push({
        id: `edge_${targetId}__to__${link.from}`,
        fromNode: targetId,
        toNode: link.from,
        fromSide: "left",
        toSide: "right",
        label: "ref"
      });
    }
    const canvas = { nodes, edges, version: 1, title: canvasTitle };
    await adapter.write(canvasPath, JSON.stringify(canvas, null, 2));
  }
  /** ========= 跳回 ChatGPT ========= */
  async scrollToMessage(messageId) {
    const view = this.getChatGPTView();
    if (!view) return;
    await view.scrollToMessage(messageId);
  }
};
var ChatGPTView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_CHATGPT;
  }
  getDisplayText() {
    return "ChatGPT Workspace";
  }
  async onOpen() {
    const container = this.containerEl;
    container.empty();
    const web = document.createElement("webview");
    web.setAttribute("partition", "persist:gptcanvas");
    web.setAttribute("allowpopups", "true");
    web.style.width = "100%";
    web.style.height = "100%";
    web.style.border = "none";
    web.src = this.plugin.settings.chatgptUrl || "https://chatgpt.com";
    this.webviewEl = web;
    container.appendChild(web);
    web.addEventListener("did-navigate", (e) => {
      this.plugin.setSessionFromUrl(e.url);
    });
    web.addEventListener("did-navigate-in-page", (e) => {
      this.plugin.setSessionFromUrl(e.url);
    });
    web.addEventListener("dom-ready", async () => {
      try {
        await web.executeJavaScript(this.buildInjectScript());
        await this.setRound(this.activeRoundId);
        if (this.plugin.settings.enableDevtools) {
          try {
            web.openDevTools();
          } catch {
          }
        }
      } catch (e) {
        console.error("[gptCanvas][View] inject error:", e);
      }
    });
    web.addEventListener("console-message", async (e) => {
      const raw = e.message || "";
      if (!raw.startsWith("[gptCanvas][")) return;
      if (this.plugin.settings.enableDevtools && raw.indexOf("[DOM]") !== -1) {
        console.log(raw);
      }
      if (raw.startsWith("[gptCanvas][SNAPSHOT]")) {
        const json = raw.slice("[gptCanvas][SNAPSHOT]".length);
        try {
          const payload = JSON.parse(json);
          await this.plugin.applySnapshot(payload);
        } catch (err) {
          console.error("[gptCanvas] snapshot parse error:", err, json);
        }
        return;
      }
      if (raw.startsWith("[gptCanvas][HTML]")) {
        const html = raw.slice("[gptCanvas][HTML]".length);
        await this.saveDomHtml(html);
        return;
      }
    });
  }
  async onClose() {
    this.containerEl.empty();
    this.webviewEl = null;
  }
  openDevtools() {
    if (!this.webviewEl) return;
    try {
      this.webviewEl.openDevTools();
    } catch (e) {
    }
  }
  async setRound(round) {
    if (!this.webviewEl) return;
    try {
      await this.webviewEl.executeJavaScript(`window.gptCanvasRound=${round};`);
    } catch (e) {
    }
  }
  async saveDomHtml(html) {
    const { folder, domPath } = this.plugin.getSessionPaths();
    await this.plugin.ensureFolder(folder);
    await this.app.vault.adapter.write(domPath, html);
  }
  async dumpDomToFile() {
    if (!this.webviewEl) return;
    await this.webviewEl.executeJavaScript(`
      (function(){
        try {
          var html = document.documentElement.outerHTML;
          console.log("[gptCanvas][HTML]" + html);
        } catch(e) {
          console.log("[gptCanvas][LOG] dom dump error: " + e.message);
        }
      })();
    `);
  }
  async scrollToMessage(domId) {
    if (!this.webviewEl) return;
    const safe = domId.replace(/"/g, '\\"');
    const js = `
      (function(){
        var t = document.querySelector('[data-message-id="${safe}"]') || document.getElementById("${safe}");
        if(!t) return;
        t.scrollIntoView({behavior:"smooth", block:"center"});
        var old = t.style.outline;
        t.style.outline = "2px solid #ffb300";
        setTimeout(function(){ t.style.outline = old || ""; }, 1500);
      })();
    `;
    try {
      await this.webviewEl.executeJavaScript(js);
    } catch (e) {
    }
  }
  /** ====== 注入脚本（与您之前逻辑等价） ====== */
  buildInjectScript() {
    const logFlag = this.plugin.settings.enableDevtools ? "true" : "false";
    return `
(function () {
  var LOG = ${logFlag};
  window.gptCanvasRound = window.gptCanvasRound || 0;
  function dlog(){ if(!LOG) return; var a=[].slice.call(arguments); var round=window.gptCanvasRound||0; var ts=new Date().toISOString(); a.unshift(\`[\${round}] [DOM] [DEBUG] [\${ts}]\`); console.log.apply(console,a); }
  function lg(){ var a=[].slice.call(arguments); var round=window.gptCanvasRound||0; var ts=new Date().toISOString(); a.unshift(\`[\${round}] [DOM] [LOG] [\${ts}]\`); console.log.apply(console,a); }
  function ilog(){ var a=[].slice.call(arguments); var round=window.gptCanvasRound||0; var ts=new Date().toISOString(); a.unshift(\`[\${round}] [DOM] [INFO] [\${ts}]\`); console.log.apply(console,a); }

  function htmlToMd(rootEl){
    function escTxt(s){ return (s||"").replace(/\\s+$/gm,""); }
    function getText(n){ return (n.textContent||"").replace(/\\u00a0/g," "); }
    function walk(node){
      if(node.nodeType===3){ return node.nodeValue || ""; }
      if(node.nodeType!==1){ return ""; }
      var tag = node.tagName.toLowerCase();
      if(tag==="pre"){
        var code = node.querySelector("code");
        var lang = "";
        if(code){
          var cls = code.getAttribute("class")||"";
          var m = cls.match(/language-([\\w-]+)/i);
          if(m) lang = m[1];
        }
        var txt = code ? code.textContent : node.textContent;
        return "\\n\\n\\\`\\\`\\\`"+lang+"\\n"+(txt||"").replace(/\\s+$/,"")+"\\n\\\`\\\`\\\`\\n\\n";
      }
      if(tag==="code"){ return "\\\`"+getText(node)+"\\\`"; }
      if(/^h[1-6]$/.test(tag)){
        var level = parseInt(tag[1],10);
        return "\\n\\n"+("#".repeat(level))+" "+escTxt(getText(node))+"\\n\\n";
      }
      if(tag==="strong"||tag==="b"){ return "**"+walkChildren(node)+"**"; }
      if(tag==="em"||tag==="i"){ return "*"+walkChildren(node)+"*"; }
      if(tag==="del"||tag==="s"){ return "~~"+walkChildren(node)+"~~"; }
      if(tag==="a"){
        var href=node.getAttribute("href")||"";
        var txt=escTxt(walkChildren(node))||href;
        return "["+txt+"]("+href+")";
      }
      if(tag==="img"){
        var alt=node.getAttribute("alt")||"";
        var src=node.getAttribute("src")||"";
        return "!["+alt+"]("+src+")";
      }
      if(tag==="ul"){
        var out="\\n";
        var items=node.children;
        for(var i=0;i<items.length;i++){
          if(items[i].tagName && items[i].tagName.toLowerCase()==="li"){
            out += "- "+walkChildren(items[i]).replace(/\\n/g," ")+"\\n";
          }
        }
        return out+"\\n";
      }
      if(tag==="ol"){
        var outo="\\n";
        var n=1;
        var its=node.children;
        for(var j=0;j<its.length;j++){
          if(its[j].tagName && its[j].tagName.toLowerCase()==="li"){
            outo += (n++)+". "+walkChildren(its[j]).replace(/\\n/g," ")+"\\n";
          }
        }
        return outo+"\\n";
      }
      if(tag==="blockquote"){
        var t = walkChildren(node).split("\\n").map(function(l){ return l ? ("> "+l) : ">"; }).join("\\n");
        return "\\n"+t+"\\n\\n";
      }
      if(tag==="hr"){ return "\\n\\n---\\n\\n"; }
      if(tag==="p"){ return "\\n\\n"+escTxt(walkChildren(node))+"\\n\\n"; }
      if(tag==="br"){ return "  \\n"; }
      if(tag==="table"){
        var rows=node.querySelectorAll("tr");
        var md="\\n";
        for(var r=0;r<rows.length;r++){
          var cells=rows[r].children, line=[];
          for(var c=0;c<cells.length;c++){
            line.push(escTxt(getText(cells[c])).replace(/\\|/g,"\\\\|"));
          }
          md += "| "+line.join(" | ")+" |\\n";
          if(r===0) md += "| "+line.map(function(){return "---";}).join(" | ")+" |\\n";
        }
        return md+"\\n";
      }
      return walkChildren(node);
    }
    function walkChildren(node){
      var out="";
      for(var i=0;i<node.childNodes.length;i++){
        out += walk(node.childNodes[i]);
      }
      return out;
    }
    return walkChildren(rootEl).replace(/[ \\t]+$/gm,"").trim();
  }

  function collectMessages(){
    var res=[];
    var blocks = document.querySelectorAll("[data-message-author-role]");
    for(var i=0;i<blocks.length;i++){
      var el=blocks[i];
      var role = el.getAttribute("data-message-author-role")||"assistant";
      if(role!=="user") role="assistant";
      var domId = el.getAttribute("data-message-id")||el.id||("idx-"+i);
      var body = el.querySelector(".markdown, .prose, article") || el;
      var md = htmlToMd(body);
      if(!md) continue;
      res.push({ domId: domId, role: role, text: md });
    }
    return res;
  }

  var lastSelection = null;
  var selectionUsed = null;
  var selectionLockedByQuote = false;
  document.addEventListener("mouseup", function(){
    try{
      var sel=window.getSelection();
      if(!sel||sel.rangeCount===0) return;
      var txt=(sel.toString()||"").trim();
      if(!txt || txt.length<4) return;

      var range=sel.getRangeAt(0);
      var node=range.commonAncestorContainer;
      var el=node.nodeType===1 ? node : node.parentElement;
      if(!el) return;

      var block=el.closest("[data-message-author-role]");
      if(!block) return;

      var domId=block.getAttribute("data-message-id")||block.id||"";
      if(!domId) return;

      lastSelection={ domId: domId, text: txt.slice(0,400) };
      selectionUsed = null;
      selectionLockedByQuote = false;
      ilog("selection bound", domId, txt.slice(0,40));
    }catch(e){}
  });

  function normalizeText(text){
    if(!text) return "";
    return text.replace(/\\s+/g," ").trim();
  }
  function getInputText(input){
    if(!input) return "";
    var value = "";
    if(input.isContentEditable){
      value = input.innerText || "";
    } else {
      value = input.value || "";
    }
    return normalizeText(value);
  }
  function bindQuoteButtons(){
    var buttons = document.querySelectorAll("button");
    for(var i=0;i<buttons.length;i++){
      var btn=buttons[i];
      if(btn._gptCanvasQuoteBound) continue;
      var text = (btn.textContent||"").trim();
      var label = text.replace(/\\s+/g,"").toLowerCase();
      if(label.indexOf("\u8BE2\u95EEchatgpt")===-1 && label.indexOf("askchatgpt")===-1) continue;
      btn._gptCanvasQuoteBound = true;
      btn.addEventListener("click", function(){
        if(lastSelection){
          selectionUsed = lastSelection;
          selectionLockedByQuote = true;
        }
        ilog("quote button clicked", lastSelection ? lastSelection.domId : "none");
      }, true);
    }
  }

  function markSelectionUsed(input){
    if(!selectionUsed || !input){
      return;
    }
    if(selectionLockedByQuote){
      // \u663E\u5F0F\u70B9\u51FB\u201C\u8BE2\u95EE ChatGPT\u201D\u9501\u5B9A\u7684\u9009\u533A\uFF0C\u4E0D\u518D\u505A\u8F93\u5165\u5339\u914D\u8FC7\u6EE4
      return;
    }
    try{
      var text = getInputText(input);
      if(!text){
        selectionUsed = null;
        return;
      }
      var snippet = normalizeText(selectionUsed.text || "");
      if(!snippet){
        selectionUsed = null;
        return;
      }
      if(text.indexOf(snippet) === -1){
        selectionUsed = null;
      }
    }catch(e){
      selectionUsed = null;
    }
  }

  function emitSnapshot(reason){
    try{
      var msgs=collectMessages();
      var payload={ url: location.href, reason: reason||"auto", messages: msgs, selection: (reason==="user-send" ? selectionUsed : null) };
      console.log("[gptCanvas][SNAPSHOT]"+JSON.stringify(payload));
      if(reason==="user-send"){
        lastSelection=null;
        selectionUsed=null;
      }
    }catch(e){
      console.log("[gptCanvas][LOG] snapshot error: "+e.message);
    }
  }

  function bindSend(){
    var input = document.querySelector('[contenteditable="true"]') || document.querySelector("textarea");
    if(input && !input._gptCanvasSendBound){
      input._gptCanvasSendBound=true;
      input.addEventListener("keydown", function(e){
        if(e.key==="Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey){
          // send triggered\uFF08\u952E\u76D8\uFF09
          markSelectionUsed(input);
          setTimeout(function(){ emitSnapshot("user-send"); }, 900);
        }
      }, true);
    }
    var btn = document.querySelector('button[data-testid="send-button"]') ||
              document.querySelector('button[aria-label*="\u53D1\u9001"]') ||
              document.querySelector('button[aria-label*="Send"]');
    if(btn && !btn._gptCanvasClickBound){
      btn._gptCanvasClickBound=true;
      btn.addEventListener("click", function(){
        // send triggered\uFF08\u70B9\u51FB\u6309\u94AE\uFF09
        markSelectionUsed(input);
        setTimeout(function(){ emitSnapshot("user-send"); }, 900);
      }, true);
    }
  }

  var snapTimer=null;
  var mo=new MutationObserver(function(muts){
    var need=false;
    for(var i=0;i<muts.length;i++){
      var m=muts[i];
      if(m.type==="childList"||m.type==="characterData"){ need=true; break; }
    }
    if(!need) return;
    bindSend();
    bindQuoteButtons();
    if(snapTimer) clearTimeout(snapTimer);
    snapTimer=setTimeout(function(){ emitSnapshot("mut"); }, 800);
  });

  function start(){
    try{
      mo.observe(document.body, {childList:true, characterData:true, subtree:true});
      bindSend();
      bindQuoteButtons();
      emitSnapshot("init");
    }catch(e){
    }
  }

  if(document.readyState==="complete" || document.readyState==="interactive"){ start(); }
  else { window.addEventListener("DOMContentLoaded", start, {once:true}); }

  window.gptCanvasDumpHtml = function(){
    try{
      var html=document.documentElement.outerHTML;
      console.log("[gptCanvas][HTML]"+html);
    }catch(e){
      console.log("[gptCanvas][LOG] dumpHtml error: "+e.message);
    }
  };
})();
`;
  }
};
var GptCanvasSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "gptCanvas Settings" });
    new import_obsidian.Setting(containerEl).setName("ChatGPT URL").setDesc("\u9ED8\u8BA4\u5185\u5D4C\u7684 ChatGPT \u5DE5\u4F5C\u533A\u5730\u5740").addText((t) => {
      t.setPlaceholder("https://chatgpt.com").setValue(this.plugin.settings.chatgptUrl).onChange(async (v) => {
        this.plugin.settings.chatgptUrl = v.trim() || "https://chatgpt.com";
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Auto-generate canvas").setDesc("\u4ECE\u4F1A\u8BDD\u5FEB\u7167\u81EA\u52A8\u751F\u6210 chatgpt-session.canvas").addToggle((tg) => {
      tg.setValue(this.plugin.settings.autoCreateCanvas).onChange(async (v) => {
        this.plugin.settings.autoCreateCanvas = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Enable webview DevTools").setDesc("\u5141\u8BB8\u901A\u8FC7\u547D\u4EE4\u6253\u5F00\u5185\u5D4C ChatGPT \u9875\u9762\u7684 DevTools\uFF08Elements \u9762\u677F+\u6307\u9488\u9009\u62E9\uFF09").addToggle((tg) => {
      tg.setValue(this.plugin.settings.enableDevtools).onChange(async (v) => {
        this.plugin.settings.enableDevtools = v;
        await this.plugin.saveSettings();
      });
    });
  }
};
//# sourceMappingURL=main.js.map
