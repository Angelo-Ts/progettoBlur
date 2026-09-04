(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = text => { $('status').textContent = text || ''; };
  async function send(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }
  function renderRules(items = []) {
    const root = $('rules'); root.replaceChildren();
    for (const rule of items) {
      const row = document.createElement('div'); row.className = 'rule';
      const label = document.createElement('span'); label.textContent = `${rule.effect} · ${rule.status}${rule.enabled ? '' : ' · disabilitata'}`;
      const remove = document.createElement('button'); remove.textContent = 'Rimuovi effetto';
      remove.onclick = async () => { await send('POPUP_REMOVE_BLUR_PAGE_ONLY', { ruleId: rule.ruleId }); status('Effetto rimosso dalla pagina. La regola resta salvata.'); };
      const toggle = document.createElement('button'); toggle.textContent = rule.enabled ? 'Disattiva' : 'Attiva';
      toggle.onclick = async () => { await send(rule.enabled ? 'POPUP_DISABLE_RULE' : 'POPUP_ENABLE_RULE', { ruleId: rule.ruleId }); await refresh(); };
      const del = document.createElement('button'); del.textContent = 'Elimina';
      del.onclick = async () => { await send('POPUP_DELETE_RULE', { ruleId: rule.ruleId }); await refresh(); };
      row.append(label, remove, toggle, del); root.appendChild(row);
    }
  }
  async function refresh() {
    const r = await send('POPUP_GET_STATE');
    if (!r?.ok) return status(r?.error || 'Impossibile leggere lo stato della pagina.');
    $('enabled').checked = r.extensionEnabled !== false; renderRules(r.rules);
  }
  $('enabled').onchange = async e => { const r = await send('POPUP_SET_EXTENSION_ENABLED', { enabled: e.target.checked }); if (!r?.ok) status(r?.error); else await refresh(); };
  $('select').onclick = async () => { const r = await send('POPUP_START_SELECTION'); if (r?.ok) window.close(); else status(r?.error || 'Impossibile avviare la selezione.'); };
  $('removeAll').onclick = async () => { const r = await send('POPUP_REMOVE_ALL_EFFECTS_PAGE'); status(r?.ok ? 'Effetti rimossi dalla pagina.' : (r?.error || 'Errore')); };
  refresh();
})();
