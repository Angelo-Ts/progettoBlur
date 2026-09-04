import { MESSAGE } from '../core/constants.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('pb:settings').then((state) => {
    if (!state['pb:settings']) chrome.storage.local.set({ 'pb:settings': { extensionEnabled: true } });
  });
});

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message?.type) return sendResponse({ ok: false, error: 'missing-message-type' });
    if (message.type === MESSAGE.CONTENT_SELECTION_CAPTURED) return sendResponse({ ok: true });

    const tab = sender.tab || await activeTab();
    if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
    const contentType = message.type.startsWith('POPUP_') ? message.type : null;
    const forward = contentType === MESSAGE.POPUP_START_SELECTION ? MESSAGE.BG_ENTER_SELECTION
      : contentType === MESSAGE.POPUP_STOP_SELECTION ? MESSAGE.BG_EXIT_SELECTION
      : contentType === MESSAGE.POPUP_RETRY_RULE ? MESSAGE.BG_RETRY_RULE_ON_PAGE
      : contentType === MESSAGE.POPUP_REMOVE_BLUR_PAGE_ONLY ? MESSAGE.BG_REMOVE_RULE_EFFECT_PAGE
      : contentType === MESSAGE.POPUP_GET_STATE ? 'CONTENT_GET_STATE' : message.type;
    const payload = { ...message, type: forward };
    if (message.type === MESSAGE.POPUP_SET_EXTENSION_ENABLED) {
      await chrome.storage.local.set({ 'pb:settings': { extensionEnabled: Boolean(message.enabled) } });
      return sendResponse({ ok: true });
    }
    if ([MESSAGE.POPUP_DISABLE_RULE, MESSAGE.POPUP_ENABLE_RULE, MESSAGE.POPUP_DELETE_RULE].includes(message.type)) {
      await chrome.tabs.sendMessage(tab.id, { ...payload, type: message.type });
      return sendResponse({ ok: true });
    }
    const response = await chrome.tabs.sendMessage(tab.id, payload);
    sendResponse(response || { ok: true });
  })().catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
