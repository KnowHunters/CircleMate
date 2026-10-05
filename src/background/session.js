import { validId } from "./domain.js";
import { WEB_BEARER } from "./web-client.js";

export class SessionProvider {
  constructor(chrome) { this.chrome = chrome; this.tokens = new Map(); }
  observe(details) {
    const token = details.requestHeaders?.find(h => h.name.toLowerCase() === "authorization")?.value;
    if (token?.startsWith("Bearer ") && details.tabId >= 0) this.tokens.set(details.tabId, token);
  }
  async get(tabId, requireToken = true) {
    const tab = await this.chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    if (!["https://x.com", "https://twitter.com"].includes(url.origin)) throw new Error("请在已登录的 X 页面使用插件");
    const stores = await this.chrome.cookies.getAllCookieStores();
    const store = stores.find(s => s.tabIds.includes(tabId));
    if (!store) throw new Error("无法确定当前标签页的登录会话");
    const cookies = await this.chrome.cookies.getAll({ url: url.origin, storeId: store.id });
    const csrf = cookies.find(c => c.name === "ct0")?.value;
    let accountId;
    try { accountId = decodeURIComponent(cookies.find(c => c.name === "twid")?.value || "").replace(/^u=/, "").replace(/"/g, ""); } catch { accountId = ""; }
    if (!csrf || !cookies.some(c => c.name === "auth_token") || !validId(accountId)) throw new Error("登录状态不可用，请重新登录 X");
    const authorization = this.tokens.get(tabId) || WEB_BEARER;
    let viewer;
    if (requireToken && this.chrome.tabs.sendMessage) {
      try { viewer = await this.chrome.tabs.sendMessage(tabId, { type: 'CIRCLEMATE_GET_VIEWER' }, { frameId: 0 }); } catch {}
    }
    return { origin: url.origin, csrf, authorization, accountId, tabId, storeId: store.id, viewer };
  }
  async assertCurrent(s) {
    const current = await this.get(s.tabId, false);
    if (current.accountId !== s.accountId || current.storeId !== s.storeId || current.csrf !== s.csrf) throw new Error("登录会话已切换，请刷新页面后重试");
  }
}
