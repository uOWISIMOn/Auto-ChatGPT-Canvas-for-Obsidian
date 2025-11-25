// inject.js
console.log("[gptCanvas][inject] preload script loaded (start)");

let ipcRenderer = null;
try {
  // Obsidian 桌面端的 webview preload 可以 require electron
  // 如果这里报错，说明 preload 环境/路径有问题
  // eslint-disable-next-line
  ipcRenderer = require("electron").ipcRenderer;
  console.log("[gptCanvas][inject] ipcRenderer acquired");
} catch (e) {
  console.error("[gptCanvas][inject] Failed to require electron.ipcRenderer:", e);
}

function getSelectionText() {
  const sel = window.getSelection();
  if (!sel) return "";
  return sel.toString();
}

function getSelectionContext() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0);
  const cloned = range.cloneContents();
  const div = document.createElement("div");
  div.appendChild(cloned);
  let text = div.innerText || div.textContent || "";
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 200) text = text.slice(0, 200) + "...";
  return text;
}

function getClosestMessageId(node) {
  let el = node;
  while (el) {
    if (el.dataset && (el.dataset.messageId || el.dataset.messageid)) {
      return el.dataset.messageId || el.dataset.messageid;
    }
    el = el.parentElement;
  }
  return undefined;
}

document.addEventListener("mouseup", () => {
  const text = getSelectionText().trim();
  console.log("[gptCanvas][inject] mouseup, selection length:", text.length);

  if (!text) return;
  if (!ipcRenderer) {
    console.error("[gptCanvas][inject] ipcRenderer not available, cannot send");
    return;
  }

  const sel = window.getSelection();
  const anchorNode = sel && sel.anchorNode ? sel.anchorNode.parentElement : null;
  const sourceMessageId = anchorNode ? getClosestMessageId(anchorNode) : undefined;
  const selectionContext = getSelectionContext();

  const payload = {
    text,
    sourceMessageId,
    selectionContext,
  };

  console.log("[gptCanvas][inject] sending payload via sendToHost:", payload);
  ipcRenderer.sendToHost("chatgpt-selection", payload);
});

console.log("[gptCanvas][inject] preload script loaded (end)");
