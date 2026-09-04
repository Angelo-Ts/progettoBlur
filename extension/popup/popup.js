import { MESSAGE } from '../core/constants.js';

const $ = (id) => document.getElementById(id);
const status = (text) => { $('status').textContent = text || ''; };

async function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function renderRules(items = []) {
  const root = $('rules');
  root.replaceChildren();
  for (const rule of items) {
    const row = document.createElement('div');
    row.className = 'rule';
    const label = document.createElement('span');
    label.textContent = `${rule.effect} · ${rule.status}${rule.enabled ? '' : ' · disabilitata'}`;
    const remove = document.createElement('button');
    remove.textContent = 'Rimuovi';
    remove.addEventListener('click', async () => { await send(MESSAGE.POPUP_REMOVE_BLUR_PAGE_ONLY, { ruleId: rule.ruleId }); status('Effetto rimosso dalla pagina.'); });
    const toggle = document.createElement('button');
    toggle.textContent = rule.enabled ? 'Disattiva' : 'Attiva';
    toggle.addEventListener('click', async () => {
      await send(rule.enabled ? MESSAGE.POPUP_DISABLE_RULE : MESSAGE.POPUP_ENABLE_RULE, { ruleId: rule.ruleId });
      await refresh();
    });
    row.append(label, remove, toggle);
    root.appendChild(row);
  }
}

async function refresh() {
  const response = await send(MESSAGE.POPUP_GET_STATE);
  if (!response?.ok && response?.error) return status(response.error);
  $('enabled').checked = response?.extensionEnabled !== false;
  renderRules(response?.rules);
}

$('enabled').addEventListener('change', async (event) => {
  await send(MESSAGE.POPUP_SET_EXTENSION_ENABLED, { enabled: event.target.checked });
  await refresh();
});
$('select').addEventListener('click', async () => { const r = await send(MESSAGE.POPUP_START_SELECTION); window.close(); if (r?.error) status(r.error); });
$('removeAll').addEventListener('click', async () => { await send(MESSAGE.POPUP_REMOVE_ALL_EFFECTS_PAGE); status('Effetti rimossi dalla pagina.'); });
refresh();
