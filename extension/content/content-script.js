import { MESSAGE, RETRY_POLICY, SETTINGS_KEY } from '../core/constants.js';
import { SelectionController } from '../core/selection.js';
import { generateFingerprintFromElement } from '../core/fingerprint.js';
import { matchRuleOnDocument } from '../core/matcher.js';
import { EffectRenderer } from '../core/effects.js';
import { ChromeStorageAdapter, RuleStore, pageContextFromUrl } from '../core/storage.js';

const store = new RuleStore(new ChromeStorageAdapter());
const renderer = new EffectRenderer(document);
const selector = new SelectionController(document);
let retryTimer;
let retryAttempts = new Map();

const context = () => pageContextFromUrl(location.href);
const extensionEnabled = async () => (await store.getSettings()).extensionEnabled !== false;

async function evaluateRule(rule) {
  if (!rule.enabled || !(await extensionEnabled())) {
    renderer.removeByRuleId(rule.ruleId);
    return store.setRuleStatus(rule.ruleId, 'disabled', context(), 0);
  }
  const result = await matchRuleOnDocument(rule, document);
  const decision = result.decision;
  await store.setRuleStatus(rule.ruleId, decision.status, context(), decision.confidence);
  renderer.removeByRuleId(rule.ruleId);
  if (decision.status === 'active' && decision.selectedCandidate?.element) {
    renderer.applyEffect(decision.selectedCandidate.element, rule);
  }
  return decision;
}

async function evaluateAll() {
  const ctx = context();
  const all = await store.getRulesForPage(ctx.domain, ctx.path);
  const pending = [];
  for (const rule of all) {
    const decision = await evaluateRule(rule);
    if (rule.enabled && (decision.status === 'notFound' || decision.status === 'ambiguous')) pending.push(rule.ruleId);
  }
  scheduleRetries(pending);
}

function scheduleRetries(ruleIds) {
  if (retryTimer) clearTimeout(retryTimer);
  if (!ruleIds.length) return;
  retryTimer = setTimeout(async () => {
    let didRetry = false;
    for (const id of ruleIds) {
      const attempts = retryAttempts.get(id) || 0;
      if (attempts >= RETRY_POLICY.maxAutoRetryAttemptsPerRulePerLoad) continue;
      const rule = await store.getRule(id);
      if (!rule || !rule.enabled) continue;
      retryAttempts.set(id, attempts + 1);
      const decision = await evaluateRule(rule);
      didRetry = true;
      if (decision.status === 'notFound' || decision.status === 'ambiguous') scheduleRetries([id]);
    }
    if (!didRetry) retryTimer = undefined;
  }, RETRY_POLICY.mutationDebounceMs);
}

selector.stop();
async function beginSelection() {
  selector.start(async (element) => {
    const ctx = context();
    const now = new Date().toISOString();
    const rule = {
      ruleId: `rule-${crypto.randomUUID()}`,
      scope: 'page', domain: ctx.domain, path: ctx.path, url: location.href,
      enabled: true, status: 'active', effect: 'blur', intensity: 60,
      createdAt: now, updatedAt: now,
      fingerprint: await generateFingerprintFromElement(element, now)
    };
    await store.saveRule(rule);
    renderer.applyEffect(element, rule);
    await store.setRuleStatus(rule.ruleId, 'active', ctx, 1);
  });
}

async function disableRule(ruleId, enabled) {
  await store.setRuleEnabled(ruleId, enabled);
  if (!enabled) renderer.removeByRuleId(ruleId);
  else { const rule = await store.getRule(ruleId); if (rule) await evaluateRule(rule); }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case MESSAGE.BG_ENTER_SELECTION: await beginSelection(); break;
      case MESSAGE.BG_EXIT_SELECTION: selector.stop(); break;
      case MESSAGE.BG_REMOVE_RULE_EFFECT_PAGE: renderer.removeByRuleId(message.ruleId); break;
      case MESSAGE.BG_REMOVE_ALL_EFFECTS_PAGE: renderer.removeAll(); break;
      case MESSAGE.BG_RETRY_RULE_ON_PAGE: { const r = await store.getRule(message.ruleId); if (r) await evaluateRule(r); break; }
      case MESSAGE.POPUP_DISABLE_RULE: await disableRule(message.ruleId, false); break;
      case MESSAGE.POPUP_ENABLE_RULE: await disableRule(message.ruleId, true); break;
      case MESSAGE.POPUP_DELETE_RULE: renderer.removeByRuleId(message.ruleId); await store.deleteRule(message.ruleId); break;
      case 'CONTENT_GET_STATE': {
        const ctx = context();
        sendResponse({ ok: true, extensionEnabled: await extensionEnabled(), selectionActive: selector.active, rules: await store.getRulesForPage(ctx.domain, ctx.path) });
        return;
      }
      default: break;
    }
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

const observer = new MutationObserver(() => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(evaluateAll, RETRY_POLICY.mutationDebounceMs);
});
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && (changes[SETTINGS_KEY] || Object.keys(changes).some((key) => key.startsWith('rule:') || key.startsWith('idx:')))) await evaluateAll();
});

evaluateAll();
