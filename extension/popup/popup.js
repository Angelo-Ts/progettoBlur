(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = text => { $('status').textContent = text || ''; $('status').classList.toggle('error', Boolean(text && /errore|impossibile|non permette/i.test(text))); };
  async function send(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }

  function effectLabel(rule) {
    const names = { blur: 'Blur', strongBlur: 'Blur forte', pixelate: 'Pixelatura', blackout: 'Oscura', hide: 'Nascondi' };
    return names[rule.effect] || rule.effect || 'Effetto';
  }

  function renderRules(items = []) {
    const root = $('rules');
    root.replaceChildren();
    $('ruleCount').textContent = String(items.length);
    $('empty').hidden = items.length > 0;

    for (const rule of items) {
      const row = document.createElement('article');
      row.className = 'rule';

      const head = document.createElement('div');
      head.className = 'rule-head';
      const name = document.createElement('span');
      name.className = 'rule-name';
      name.textContent = effectLabel(rule);
      name.title = rule.url || '';
      const badge = document.createElement('span');
      badge.className = `rule-status${rule.enabled ? '' : ' disabled'}`;
      badge.textContent = rule.enabled ? 'Attiva' : 'Disattivata';
      head.append(name, badge);

      const actions = document.createElement('div');
      actions.className = 'rule-actions';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Togli effetto ora';
      remove.title = 'Rimuove il blur solo dalla pagina corrente. La regola resta salvata.';
      remove.onclick = async () => {
        const r = await send('POPUP_REMOVE_BLUR_PAGE_ONLY', { ruleId: rule.ruleId });
        if (r?.ok) status('Effetto tolto dalla pagina. La regola è ancora salvata.');
        else status(r?.error || 'Impossibile togliere l’effetto.');
      };

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = rule.enabled ? 'Disattiva regola' : 'Riattiva regola';
      toggle.title = rule.enabled ? 'La regola non verrà più applicata finché non la riattivi.' : 'Riattiva la regola e prova ad applicarla alla pagina.';
      toggle.onclick = async () => {
        const r = await send(rule.enabled ? 'POPUP_DISABLE_RULE' : 'POPUP_ENABLE_RULE', { ruleId: rule.ruleId });
        if (!r?.ok) status(r?.error || 'Impossibile modificare la regola.');
        else { status(rule.enabled ? 'Regola disattivata.' : 'Regola riattivata.'); await refresh(); }
      };

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete';
      del.textContent = 'Elimina regola';
      del.title = 'Cancella definitivamente questa regola.';
      del.onclick = async () => {
        if (!confirm('Eliminare definitivamente questa regola?')) return;
        const r = await send('POPUP_DELETE_RULE', { ruleId: rule.ruleId });
        if (r?.ok) { status('Regola eliminata definitivamente.'); await refresh(); }
        else status(r?.error || 'Impossibile eliminare la regola.');
      };

      actions.append(remove, toggle, del);
      row.append(head, actions);
      root.appendChild(row);
    }
  }

  async function refresh() {
    const r = await send('POPUP_GET_STATE');
    if (!r?.ok) return status(r?.error || 'Impossibile leggere lo stato della pagina.');
    $('enabled').checked = r.extensionEnabled !== false;
    renderRules(r.rules);
  }

  $('close').onclick = () => window.close();
  $('enabled').onchange = async e => {
    const r = await send('POPUP_SET_EXTENSION_ENABLED', { enabled: e.target.checked });
    if (!r?.ok) status(r?.error || 'Impossibile modificare lo stato.');
    else { status(e.target.checked ? 'Estensione attivata.' : 'Estensione disattivata.'); await refresh(); }
  };
  $('select').onclick = async () => {
    const r = await send('POPUP_START_SELECTION');
    if (r?.ok) status('Selezione attiva: passa sulla pagina e clicca l’elemento da oscurare. Premi Esc per annullare.');
    else status(r?.error || 'Impossibile avviare la selezione.');
  };
  $('removeAll').onclick = async () => {
    const r = await send('POPUP_REMOVE_ALL_EFFECTS_PAGE');
    if (r?.ok) { status('Tutti gli effetti sono stati tolti dalla pagina. Le regole restano salvate.'); await refresh(); }
    else status(r?.error || 'Impossibile togliere gli effetti.');
  };
  $('deleteAll').onclick = async () => {
    if (!confirm('Eliminare TUTTE le regole salvate? Questa operazione non può essere annullata.')) return;
    const r = await send('POPUP_DELETE_ALL_RULES');
    if (r?.ok) { status('Tutte le regole sono state eliminate.'); await refresh(); }
    else status(r?.error || 'Impossibile eliminare le regole.');
  };
  refresh();
})();
