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
var DEFAULT_CARD_STYLES = {
  rootQuestion: { width: 420, minHeight: 96, maxHeight: 520, headingLevel: 1 },
  rootAnswer: { width: 420, minHeight: 96, maxHeight: 520, headingLevel: 2 },
  childQuestion: { width: 340, minHeight: 80, maxHeight: 400, headingLevel: 1 },
  childAnswer: { width: 340, minHeight: 80, maxHeight: 400, headingLevel: 0 }
};
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
  refColumnGap: 32,
  cardStyles: DEFAULT_CARD_STYLES
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
    // 引入防抖，避免高频写入
    this.updateCanvasDebounced = (0, import_obsidian.debounce)(
      async (data) => {
        await this.updateCanvasFromSession(data);
      },
      1e3,
      true
    );
  }
  async onload() {
    await this.loadSettings();
    await this.ensureFolder(LOG_ROOT);
    this.registerView(VIEW_TYPE_CHATGPT, (leaf) => new ChatGPTView(leaf, this));
    this.registerCanvasClickHandler();
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
    const savedLayout = saved.layout || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});
    this.settings.layout = Object.assign({}, DEFAULT_LAYOUT, savedLayout);
    this.settings.layout.cardStyles = this.mergeCardStyles(savedLayout.cardStyles);
    this.settings.sessionFolders = Object.assign({}, saved.sessionFolders || {});
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  mergeCardStyles(saved) {
    return {
      rootQuestion: Object.assign({}, DEFAULT_CARD_STYLES.rootQuestion, saved?.rootQuestion || {}),
      rootAnswer: Object.assign({}, DEFAULT_CARD_STYLES.rootAnswer, saved?.rootAnswer || {}),
      childQuestion: Object.assign({}, DEFAULT_CARD_STYLES.childQuestion, saved?.childQuestion || {}),
      childAnswer: Object.assign({}, DEFAULT_CARD_STYLES.childAnswer, saved?.childAnswer || {})
    };
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
  computeNodeSize(text, width, cardStyle) {
    const l = this.settings.layout;
    const style = cardStyle || {};
    const widthValue = Math.max(1, width);
    const plain = text.replace(/\r/g, "");
    const hard = plain.split("\n").length;
    const soft = Math.ceil(plain.replace(/\n/g, "").length / Math.max(l.charsPerLine, 12));
    const lines = Math.max(hard, soft, 1);
    const headingLevel = Math.max(0, Math.min(6, style.headingLevel ?? 0));
    const lineHeight = l.baseLineHeight + headingLevel * 2;
    const raw = lines * lineHeight + 28;
    const minHeight = style.minHeight ?? l.minNodeHeight;
    const maxHeight = style.maxHeight ?? l.maxNodeHeight;
    const height = Math.max(minHeight, Math.min(raw, maxHeight));
    return { width: widthValue, height };
  }
  getCardStyle(depth, isQuestion) {
    const styles = this.settings.layout.cardStyles || DEFAULT_CARD_STYLES;
    if (depth > 0) {
      return isQuestion ? styles.childQuestion : styles.childAnswer;
    }
    return isQuestion ? styles.rootQuestion : styles.rootAnswer;
  }
  removeReferenceSegment(text, segment) {
    if (!segment) return text;
    const idx = text.indexOf(segment);
    if (idx === -1) return text;
    const before = text.slice(0, idx).replace(/\s+$/, "");
    const after = text.slice(idx + segment.length).replace(/^\s+/, "");
    if (!before) return after;
    if (!after) return before;
    return `${before}
${after}`;
  }
  truncateMd(md, maxChars = 180) {
    const s = (md || "").replace(/\n{3,}/g, "\n\n").trim();
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + " \u2026";
  }
  /**
   * Build per-node metadata used to navigate back into ChatGPT.
   * sessionUrl is taken directly from session.json without reconstruction.
   */
  buildNodeMetaForMessage(message, sessionUrl) {
    if (!sessionUrl) return null;
    const sessionId = this.getSessionIdFromUrl(sessionUrl);
    const messageTestId = message.domId || message.id;
    if (!messageTestId) return null;
    return {
      sessionId,
      sessionUrl,
      messageTestId
    };
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
      const domId = s.domId || "";
      if (!text || domId.includes("placeholder")) continue;
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
    const filteredMessages = mergedMessages.filter((m) => {
      const text = (m.text || "").trim();
      return text && !m.id.includes("placeholder");
    });
    filteredMessages.sort((a, b) => a.seq - b.seq);
    const mergedLinks = Array.isArray(prev.links) ? [...prev.links] : [];
    if (payload.reason === "user-send") {
      this.startRound();
    }
    const selectionText = payload.selection && payload.selection.text ? payload.selection.text.trim() : "";
    if (payload.reason === "user-send" && payload.selection?.domId && selectionText) {
      const fromId = payload.selection.domId;
      const latestUser = [...filteredMessages].filter((m) => m.role === "user").sort((a, b) => b.seq - a.seq)[0];
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
    const data = { messages: filteredMessages, links: mergedLinks, sessionUrl };
    await this.writeSession(data);
    if (this.settings.autoCreateCanvas) {
      this.updateCanvasDebounced(data);
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
    const sessionUrl = data.sessionUrl ?? null;
    const existingCanvas = await this.readExistingCanvas(canvasPath);
    const existingNodes = existingCanvas?.nodes ?? [];
    const existingEdges = existingCanvas?.edges ?? [];
    const nodes = [];
    const edges = [...existingEdges];
    const generatedNodeIds = /* @__PURE__ */ new Set();
    const canvasNodeMap = new Map(existingNodes.map((node) => [node.id, node]));
    const existingEdgeIds = new Set(edges.map((edge) => edge.id));
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
    const referenceTextByQuestionId = /* @__PURE__ */ new Map();
    for (const link of data.links) {
      if (link.type !== "ref") continue;
      if (!link.to) continue;
      const trimmed = (link.refText || "").trim();
      if (trimmed) {
        referenceTextByQuestionId.set(link.to, trimmed);
      }
    }
    const layoutTurn = (turn, baseX, baseY, qWidth, aWidth, columnIndex) => {
      const depth = columnIndex;
      const label = this.getTurnLabel(turn);
      const questionStyle = this.getCardStyle(depth, true);
      const answerStyle = this.getCardStyle(depth, false);
      const questionWidth = questionStyle.width ?? qWidth;
      const answerWidth = answerStyle.width ?? aWidth;
      const questionHeadingLevel = Math.max(0, Math.min(6, questionStyle.headingLevel ?? 1));
      const answerHeadingLevel = Math.max(0, Math.min(6, answerStyle.headingLevel ?? 0));
      const buildHeadingLine = (level, text) => level === 0 ? text : `${"#".repeat(level)} ${text}`;
      const headingPrefix = questionHeadingLevel === 0 ? "" : "#".repeat(questionHeadingLevel) + " ";
      const questionHeading = buildHeadingLine(questionHeadingLevel, `Q#${label}`);
      const refText = referenceTextByQuestionId.get(turn.q.id);
      const blockquote = refText ? `> ${refText.replace(/\n/g, "\n> ")}

` : "";
      const sanitizedQuestionText = refText ? this.removeReferenceSegment(turn.q.text, refText) : turn.q.text;
      const applyHeadingPrefix = (value, prefix) => {
        if (!prefix) return value;
        return value.split("\n").map((line) => line.trim() ? `${prefix}${line}` : line).join("\n");
      };
      const questionBody = applyHeadingPrefix(sanitizedQuestionText, headingPrefix);
      const qBody = blockquote ? `${blockquote}${questionBody}` : questionBody;
      const qFull = `${questionHeading}
${qBody}`;
      const existingQNode = canvasNodeMap.get(turn.q.id);
      let qMeta = this.extractMetaFromCanvasNode(existingQNode) || this.buildNodeMetaForMessage(turn.q, sessionUrl);
      let finalQX = baseX;
      let finalQY = baseY;
      if (existingQNode) {
        const isMoved = qMeta?.lastAutoPos && (Math.abs(existingQNode.x - qMeta.lastAutoPos.x) > 5 || Math.abs(existingQNode.y - qMeta.lastAutoPos.y) > 5);
        if (qMeta?.manualPos) {
          finalQX = qMeta.manualPos.x;
          finalQY = qMeta.manualPos.y;
        } else if (isMoved) {
          finalQX = existingQNode.x;
          finalQY = existingQNode.y;
          if (qMeta) qMeta.manualPos = { x: finalQX, y: finalQY };
        }
      }
      if (qMeta) qMeta.lastAutoPos = { x: baseX, y: baseY };
      const qSize = this.computeNodeSize(qFull, questionWidth, questionStyle);
      nodes.push({
        id: turn.q.id,
        type: "text",
        x: finalQX,
        y: finalQY,
        width: qSize.width,
        height: qSize.height,
        text: qFull,
        color: "4",
        object: qMeta || void 0
      });
      generatedNodeIds.add(turn.q.id);
      let ghostBottom = baseY + qSize.height;
      let ghostRight = baseX + qSize.width;
      if (turn.a) {
        const answerHeading = buildHeadingLine(answerHeadingLevel, `A#${label}`);
        const answerPrefix = answerHeadingLevel === 0 ? "" : "#".repeat(answerHeadingLevel) + " ";
        const answerBody = applyHeadingPrefix(turn.a.text, answerPrefix);
        const aFull = `${answerHeading}
${answerBody}`;
        const existingANode = canvasNodeMap.get(turn.a.id);
        let aMeta = this.extractMetaFromCanvasNode(existingANode) || this.buildNodeMetaForMessage(turn.a, sessionUrl);
        const idealAX = baseX + qSize.width + L.horizontalGap;
        const idealAY = baseY;
        let finalAX = idealAX;
        let finalAY = idealAY;
        if (existingANode) {
          const isMoved = aMeta?.lastAutoPos && (Math.abs(existingANode.x - aMeta.lastAutoPos.x) > 5 || Math.abs(existingANode.y - aMeta.lastAutoPos.y) > 5);
          if (aMeta?.manualPos) {
            finalAX = aMeta.manualPos.x;
            finalAY = aMeta.manualPos.y;
          } else if (isMoved) {
            finalAX = existingANode.x;
            finalAY = existingANode.y;
            if (aMeta) aMeta.manualPos = { x: finalAX, y: finalAY };
          }
        }
        if (aMeta) aMeta.lastAutoPos = { x: idealAX, y: idealAY };
        const aSize = this.computeNodeSize(aFull, answerWidth, answerStyle);
        nodes.push({
          id: turn.a.id,
          type: "text",
          x: finalAX,
          y: finalAY,
          width: aSize.width,
          height: aSize.height,
          text: aFull,
          color: "3",
          object: aMeta || void 0
        });
        generatedNodeIds.add(turn.a.id);
        ghostBottom = Math.max(ghostBottom, idealAY + aSize.height);
        ghostRight = Math.max(ghostRight, idealAX + aSize.width);
      }
      const parentId = turn.a ? turn.a.id : turn.q.id;
      const children = childTurnsByParent.get(parentId) || [];
      if (children.length > 0) {
        let childYCursor = baseY;
        const childX = ghostRight + L.refColumnGap;
        for (const child of children) {
          const childQuestionStyle = this.getCardStyle(columnIndex + 1, true);
          const childAnswerStyle = this.getCardStyle(columnIndex + 1, false);
          const childQuestionWidth = childQuestionStyle.width ?? L.refWidth;
          const childAnswerWidth = childAnswerStyle.width ?? L.refWidth;
          const childBox = layoutTurn(
            child,
            childX,
            childYCursor,
            childQuestionWidth,
            childAnswerWidth,
            columnIndex + 1
          );
          childYCursor = childBox.bottom + L.verticalGap;
          ghostRight = Math.max(ghostRight, childBox.right);
        }
        ghostBottom = Math.max(ghostBottom, childYCursor - L.verticalGap);
      }
      return { right: ghostRight, bottom: ghostBottom };
    };
    const rootTurns = turns.filter((turn) => !turn.parentId);
    let cursorY = L.startY;
    const firstRoot = rootTurns[0];
    const firstTimestamp = firstRoot?.q.ts ?? firstRoot?.a?.ts ?? Date.now();
    const canvasTitle = this.formatCanvasTimestamp(firstTimestamp);
    if (firstRoot) {
      const infoText = `Session: ${data.sessionUrl || "unknown"}
${canvasTitle}`;
      const infoWidth = L.nodeWidth;
      const infoSize = this.computeNodeSize(infoText, infoWidth);
      const infoX = L.startX - infoWidth - L.horizontalGap;
      const infoNodeId = `info_${this.currentSessionId}`;
      const infoNode = {
        id: infoNodeId,
        type: "text",
        x: infoX,
        y: L.startY,
        width: infoWidth,
        height: infoSize.height,
        text: infoText,
        color: "2"
      };
      nodes.push(infoNode);
      generatedNodeIds.add(infoNodeId);
    }
    const rootQuestionStyle = this.getCardStyle(0, true);
    const rootAnswerStyle = this.getCardStyle(0, false);
    const rootQuestionWidth = rootQuestionStyle.width ?? L.nodeWidth;
    const rootAnswerWidth = rootAnswerStyle.width ?? L.nodeWidth;
    for (const turn of rootTurns) {
      const box = layoutTurn(
        turn,
        L.startX,
        cursorY,
        rootQuestionWidth,
        rootAnswerWidth,
        0
      );
      cursorY = box.bottom + L.verticalGap;
    }
    for (const link of data.links) {
      if (link.type !== "ref") continue;
      const child = turnByUserId.get(link.to);
      if (!child) continue;
      const targetId = child.a ? child.a.id : child.q.id;
      const edgeId = `edge_${targetId}__to__${link.from}`;
      if (existingEdgeIds.has(edgeId)) continue;
      edges.push({
        id: edgeId,
        fromNode: targetId,
        toNode: link.from,
        fromSide: "left",
        toSide: "right",
        label: "ref"
      });
      existingEdgeIds.add(edgeId);
    }
    for (const node of existingNodes) {
      if (node.id.includes("placeholder")) continue;
      if (!generatedNodeIds.has(node.id)) {
        nodes.push(node);
        generatedNodeIds.add(node.id);
      }
    }
    const filteredEdges = edges.filter((edge) => generatedNodeIds.has(edge.fromNode) && generatedNodeIds.has(edge.toNode));
    const canvas = { nodes, edges: filteredEdges, version: 1, title: canvasTitle };
    const newContent = JSON.stringify(canvas, null, 2);
    const oldContent = existingCanvas ? JSON.stringify(existingCanvas, null, 2) : "";
    if (newContent !== oldContent) {
      await adapter.write(canvasPath, newContent);
    }
  }
  async readExistingCanvas(canvasPath) {
    const adapter = this.app.vault.adapter;
    try {
      if (!await adapter.exists(canvasPath)) return null;
      const raw = await adapter.read(canvasPath);
      return JSON.parse(raw);
    } catch (e) {
      console.error("[gptCanvas] readExistingCanvas error:", e);
      return null;
    }
  }
  /** ========= 跳回 ChatGPT ========= */
  async scrollToMessage(messageId) {
    const view = this.getChatGPTView();
    if (!view) return;
    await view.scrollToMessage(messageId);
  }
  /** ========= ChatGPT WebView 导航 ========= */
  findChatWebViewLeaf() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATGPT);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!view || !view.webviewEl) continue;
      const url = view.getCurrentUrl();
      if (url && url.startsWith("https://chatgpt.com")) {
        return leaf;
      }
    }
    return null;
  }
  async openChatViewInLeaf(leaf, url) {
    await leaf.setViewState({ type: VIEW_TYPE_CHATGPT, active: true });
    const view = leaf.view;
    if (view) {
      view.setInitialUrl(url);
    }
  }
  async ensureChatSession(leaf, meta) {
    const view = leaf.view;
    if (!view) throw new Error("[gptCanvas] Leaf does not host ChatGPTView");
    const webview = await view.ensureSession(meta.sessionUrl);
    return webview;
  }
  async scrollToChatMessageInWebview(webview, meta) {
    const targetId = meta.messageTestId;
    console.log(`[gptCanvas][DEBUG] Injecting JS to scroll to ID: ${targetId}`);
    const js = `
      (function() {
        console.log("[gptCanvas][Webview] Trying to scroll to:", "${targetId}");
        
        const selectors = [
          '[data-testid="${targetId}"]',
          '[data-message-id="${targetId}"]',
          '#${targetId}' // \u515C\u5E95\u5C1D\u8BD5 ID
        ];

        let el = null;
        for (let sel of selectors) {
          el = document.querySelector(sel);
          if (el) {
            console.log("[gptCanvas][Webview] Found element via selector:", sel);
            break;
          }
        }

        if (!el) {
          console.error("[gptCanvas][Webview] Element NOT found for id:", "${targetId}");
          return false;
        }

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        
        // \u9AD8\u4EAE\u4E00\u4E0B\uFF0C\u65B9\u4FBF\u8089\u773C\u786E\u8BA4
        const originalBg = el.style.backgroundColor;
        el.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
        el.style.transition = "background-color 0.5s";
        setTimeout(() => {
           el.style.backgroundColor = originalBg;
        }, 2000);

        return true;
      })();
    `;
    try {
      await webview.executeJavaScript(js);
      console.log("[gptCanvas][DEBUG] JS Injection sent successfully.");
    } catch (e) {
      console.error("[gptCanvas][ERROR] scrollToChatMessageInWebview execution failed:", e);
    }
  }
  async navigateToChatMessage(meta) {
    console.log("[gptCanvas][DEBUG] Starting Navigation. Target:", meta);
    let leaf = this.findChatWebViewLeaf();
    if (!leaf) {
      console.log("[gptCanvas][DEBUG] No existing Chat Leaf found. Opening new one.");
      leaf = this.app.workspace.getRightLeaf(false) || this.app.workspace.getRightLeaf(true);
      if (!leaf) {
        new import_obsidian.Notice("Cannot get right sidebar leaf for ChatGPT view");
        return;
      }
      await this.openChatViewInLeaf(leaf, meta.sessionUrl);
    } else {
      console.log("[gptCanvas][DEBUG] Found existing Chat Leaf.");
    }
    console.log("[gptCanvas][DEBUG] Ensuring session URL:", meta.sessionUrl);
    const webview = await this.ensureChatSession(leaf, meta);
    console.log("[gptCanvas][DEBUG] Executing Scroll Command...");
    await this.scrollToChatMessageInWebview(webview, meta);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }
  /** ========= Canvas 集成：节点点击 ========= */
  /** ========= Canvas 集成：节点点击 & 按钮注入 ========= */
  registerCanvasClickHandler() {
    this.registerDomEvent(document, "click", async (evt) => {
      if (!evt.altKey && !evt.metaKey) return;
      const target = evt.target;
      if (!target) return;
      const activeLeaf = this.app.workspace.activeLeaf;
      const view = activeLeaf?.view;
      if (view?.getViewType() !== "canvas") return;
      const nodeEl = target.closest(".canvas-node");
      if (!nodeEl) return;
      console.log("[gptCanvas][DEBUG] Alt+Click detected on a canvas node.");
      let foundId = null;
      try {
        if (view.canvas && view.canvas.nodes) {
          for (const [id, node] of view.canvas.nodes) {
            if (node.nodeEl === nodeEl) {
              foundId = id;
              break;
            }
          }
        }
      } catch (e) {
        console.error("[gptCanvas] Error accessing canvas internals:", e);
      }
      if (!foundId) {
        foundId = nodeEl.getAttribute("data-id") || nodeEl.getAttribute("data-node-id") || nodeEl.id;
      }
      console.log(`[gptCanvas][DEBUG] Resolved Node ID: "${foundId}"`);
      if (!foundId) {
        console.error("[gptCanvas][ERROR] Could not associate DOM element with a Canvas Node ID.");
        new import_obsidian.Notice("GptCanvas: \u65E0\u6CD5\u8BC6\u522B\u8BE5\u8282\u70B9\u7684 ID");
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      await this.handleCanvasNodeClickById(foundId).catch((err) => {
        console.error("[gptCanvas][ERROR] handleCanvasNodeClickById failed:", err);
      });
    }, true);
  }
  /** * 更强壮的按钮注入逻辑 
   * 现在的 Obsidian Canvas 工具栏通常名为 .canvas-node-menu 或位于 shadow DOM 附近
   * 我们尝试查找节点内部或其关联的弹出菜单
   */
  ensureCanvasToolbarButtonRobust(nodeEl, nodeId) {
    let toolbar = nodeEl.querySelector(".canvas-node-menu, .canvas-node-toolbar");
    if (!toolbar && nodeEl.parentElement) {
      const menus = nodeEl.parentElement.querySelectorAll(".canvas-node-menu");
      if (menus.length > 0) {
        toolbar = menus[menus.length - 1];
      }
    }
    if (!toolbar) {
      return;
    }
    if (toolbar.querySelector('[data-gptcanvas-action="jump-chat"]')) return;
    const btn = document.createElement("div");
    btn.setAttribute("data-gptcanvas-action", "jump-chat");
    btn.setAttribute("data-node-id", nodeId);
    btn.className = "clickable-icon canvas-node-menu-item";
    btn.setAttribute("aria-label", "Jump to ChatGPT Log");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;
    toolbar.insertBefore(btn, toolbar.firstChild);
  }
  async readNodeMetaFromActiveCanvas(nodeId) {
    console.log(`[gptCanvas][DEBUG] Reading meta for node: ${nodeId}`);
    const activeLeaf = this.app.workspace.activeLeaf;
    const view = activeLeaf?.view;
    const file = view?.file;
    if (!file) {
      console.error("[gptCanvas][ERROR] Current view has no backing file.");
      return null;
    }
    try {
      const raw = await this.app.vault.adapter.read(file.path);
      const data = JSON.parse(raw);
      const nodes = Array.isArray(data.nodes) ? data.nodes : [];
      const node = nodes.find((n) => n && n.id === nodeId);
      if (!node) {
        console.error(`[gptCanvas][ERROR] Node ID ${nodeId} not found in canvas JSON.`);
        return null;
      }
      console.log("[gptCanvas][DEBUG] Found node data:", node);
      if (node.object == null) {
        console.error('[gptCanvas][ERROR] Node has no "object" field (Meta is missing).');
        return null;
      }
      const rawMeta = node.object;
      let meta;
      try {
        meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
      } catch (e) {
        console.error("[gptCanvas][ERROR] Failed to parse meta JSON:", rawMeta);
        return null;
      }
      console.log("[gptCanvas][DEBUG] Parsed Meta:", meta);
      if (!meta.sessionUrl || !meta.messageTestId) {
        console.error("[gptCanvas][ERROR] Meta is incomplete (missing url or id).");
        return null;
      }
      return meta;
    } catch (e) {
      console.error("[gptCanvas][ERROR] readNodeMetaFromActiveCanvas exception:", e);
      return null;
    }
  }
  async handleCanvasNodeClickById(nodeId) {
    const meta = await this.readNodeMetaFromActiveCanvas(nodeId);
    if (!meta) return;
    await this.navigateToChatMessage(meta);
  }
  /** 从运行时 CanvasNode（而不是文件 JSON）上提取 GptNodeMeta */
  extractMetaFromCanvasNode(node) {
    if (!node) return null;
    let data = node;
    try {
      if (typeof node.getData === "function") {
        data = node.getData();
      } else if (node.data) {
        data = node.data;
      }
    } catch (e) {
      console.error("[gptCanvas] extractMetaFromCanvasNode getData error", e);
    }
    if (!data) return null;
    const rawMeta = data.object ?? data.gptMeta ?? null;
    if (!rawMeta) return null;
    let meta;
    try {
      meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta;
    } catch (e) {
      console.error("[gptCanvas] extractMetaFromCanvasNode invalid meta", e, rawMeta);
      return null;
    }
    if (!meta || !meta.sessionUrl || !meta.messageTestId) return null;
    return meta;
  }
  /** 在 Canvas 节点上方的工具栏中插入一个按钮，用于跳转回 ChatGPT */
  ensureCanvasToolbarButton(nodeEl, nodeId) {
    const nodeContainer = nodeEl.closest(".canvas-node") ?? nodeEl;
    if (!nodeContainer) return;
    const toolbar = nodeContainer.querySelector(".canvas-node-toolbar, .canvas-node-menu, .canvas-node-controls") || nodeContainer.parentElement?.querySelector(".canvas-node-toolbar, .canvas-node-menu, .canvas-node-controls");
    if (!toolbar) {
      console.log("[gptCanvas] No canvas node toolbar found near node; skip button injection");
      return;
    }
    if (toolbar.querySelector('[data-gptcanvas-action="jump-chat"]')) return;
    const btn = document.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("data-gptcanvas-action", "jump-chat");
    btn.setAttribute("data-node-id", nodeId);
    btn.setAttribute("aria-label", "\u8DF3\u8F6C\u5230\u5BF9\u5E94\u7684 ChatGPT \u6D88\u606F");
    btn.classList.add("clickable-icon");
    btn.classList.add("canvas-node-control");
    try {
      (0, import_obsidian.setIcon)(btn, "arrow-up-right");
    } catch {
      btn.textContent = "GPT";
    }
    toolbar.appendChild(btn);
  }
};
var ChatGPTView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.initialUrl = null;
    this.currentUrl = null;
    this.plugin = plugin;
    this.webviewEl = null;
  }
  getViewType() {
    return VIEW_TYPE_CHATGPT;
  }
  getDisplayText() {
    return "ChatGPT Workspace";
  }
  setInitialUrl(url) {
    this.initialUrl = url;
    if (this.webviewEl) {
      this.loadUrl(url);
    }
  }
  // ... 在 ChatGPTView 类内部 ...
  // [新增] 等待 Webview 就绪的辅助函数
  async awaitReady() {
    if (!this.webviewEl) return;
    let attempts = 0;
    while (attempts < 20) {
      try {
        if (this.webviewEl.getURL && typeof this.webviewEl.getURL === "function") {
          this.webviewEl.getURL();
          return;
        }
      } catch (e) {
      }
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
  }
  getCurrentUrl() {
    if (!this.webviewEl) return null;
    try {
      if (typeof this.webviewEl.getURL === "function") {
        return this.webviewEl.getURL() || null;
      }
      const anyWeb = this.webviewEl;
      if (typeof anyWeb.src === "string") return anyWeb.src;
    } catch (e) {
      console.warn("[gptCanvas] getCurrentUrl called before webview ready");
      return this.currentUrl;
    }
    return this.currentUrl;
  }
  async loadUrl(url) {
    if (!this.webviewEl) return;
    this.currentUrl = url;
    try {
      if (typeof this.webviewEl.loadURL === "function") {
        await this.awaitReady();
        this.webviewEl.loadURL(url);
      } else {
        this.webviewEl.src = url;
      }
    } catch (e) {
      console.error("[gptCanvas] loadUrl error (ignored, will retry via src):", e);
      this.webviewEl.src = url;
    }
  }
  // [修改] 变得更健壮的 ensureSession
  async ensureSession(sessionUrl) {
    if (!this.webviewEl) {
      await this.onOpen();
    }
    if (!this.webviewEl) {
      throw new Error("[gptCanvas] Webview not available");
    }
    const webview = this.webviewEl;
    await this.awaitReady();
    const current = this.getCurrentUrl();
    const normalize = (u) => (u || "").replace(/\/+$/, "");
    if (!current || normalize(current) !== normalize(sessionUrl)) {
      console.log(`[gptCanvas] Navigating from [${current}] to [${sessionUrl}]`);
      await new Promise((resolve) => {
        const done = () => resolve();
        const timer = setTimeout(() => {
          console.log("[gptCanvas] Navigation timeout, proceeding anyway.");
          resolve();
        }, 5e3);
        webview.addEventListener("dom-ready", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        this.loadUrl(sessionUrl);
      });
    }
    return webview;
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
    this.webviewEl = web;
    const initial = this.initialUrl || this.plugin.settings.chatgptUrl || "https://chatgpt.com";
    web.src = initial;
    this.currentUrl = initial;
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
      if(node.classList && node.classList.contains("katex")){
        var annotation = node.querySelector("annotation");
        if(annotation){
          var tex = annotation.textContent || "";
          // \u5224\u65AD\u662F\u5426\u4E3A\u5757\u7EA7\u516C\u5F0F (display mode)
          var isBlock = node.classList.contains("katex-display") || 
                        (node.parentElement && node.parentElement.classList.contains("katex-display"));
          return isBlock ? (" $$" + tex + "$$ ") : (" $" + tex + "$ ");
        }
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
        var out="\\n";  // \u6CE8\u610F\u8FD9\u91CC\u662F\u53CC\u659C\u6760
        var items=node.children;
        for(var i=0;i<items.length;i++){
          if(items[i].tagName && items[i].tagName.toLowerCase()==="li"){
            // \u4FEE\u6B63\u70B9\uFF1Areplace(/\\n/g, " ") \u548C \u672B\u5C3E\u7684 "\\n" \u90FD\u8981\u53CC\u659C\u6760
            out += "- "+walkChildren(items[i]).trim().replace(/\\n/g," ")+"\\n";
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
            // \u4FEE\u6B63\u70B9\uFF1A\u540C\u6837\u5168\u662F\u53CC\u659C\u6760
            outo += (n++)+". "+walkChildren(its[j]).trim().replace(/\\n/g," ")+"\\n";
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
