(() => {
  'use strict';
  const SETTINGS_KEY = 'pb:settings';
  const map = {
    POPUP_GET_STATE: 'CONTENT_GET_STATE',
    POPUP_START_SELECTION: 'BG_ENTER_SELECTION',
    POPUP_STOP_SELECTION: 'BG_EXIT_SELECTION',
    POPUP_RETRY_RULE: 'BG_RETRY_RULE_ON_PAGE',
    POPUP_REMOVE_BLUR_PAGE_ONLY: 'BG_REMOVE_RULE_EFFECT_PAGE',
    POPUP_REMOVE_ALL_EFFECTS_PAGE: 'BG_REMOVE_ALL_EFFECTS_PAGE'
  };
  chrome.runtime.onInstalled.addListener(async () => {
    const state = await chrome.storage.local.get({ [SETTINGS_KEY]: null });
    if (!state[SETTINGS_KEY]) await chrome.storage.local.set({ [SETTINGS_KEY]: { extensionEnabled: true } });
  });
  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (!message?.type) return sendResponse({ ok: false, error: 'missing-message-type' });
      if (message.type === 'POPUP_SET_EXTENSION_ENABLED') {
        await chrome.storage.local.set({ [SETTINGS_KEY]: { extensionEnabled: Boolean(message.enabled) } });
        return sendResponse({ ok: true });
      }
      const tab = sender.tab || await activeTab();
      if (!tab?.id) return sendResponse({ ok: false, error: 'no-active-tab' });
      const type = map[message.type] || message.type;
      const response = await chrome.tabs.sendMessage(tab.id, { ...message, type });
      sendResponse(response || { ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();
