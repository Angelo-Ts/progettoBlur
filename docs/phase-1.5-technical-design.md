# Phase 1.5 Technical Design — progettoBlur (Chromium MV3)

## Scope and objective
Phase 1.5 defines a concrete, safety-first architecture for persistent element obscuring in Chromium/Edge Manifest V3.

Primary invariant:
- A saved rule must re-apply after refresh and browser restart until explicit user action changes/removes behavior.

Safety invariant:
- False positives are unacceptable.
- False negatives are acceptable.
- If certainty is insufficient, do not auto-apply.

---

## 1) Final folder structure

```text
/home/runner/work/progettoBlur/progettoBlur/
  manifest.json
  README.md
  docs/
    phase-1.5-technical-design.md
  src/
    background/
      serviceWorker.ts
      messageRouter.ts
    content/
      contentScript.ts
      selectionController.ts
      domObserver.ts
      spaNavigation.ts
      shadowDomWalker.ts
      iframeCoordinator.ts
      ruleApplier.ts
    core/
      models/
        rule.ts
        fingerprint.ts
        settings.ts
        states.ts
      matcher/
        candidateDiscovery.ts
        signalExtractors.ts
        scoreEngine.ts
        decisionEngine.ts
        dynamicSignalFilter.ts
      fingerprinting/
        fingerprintGenerator.ts
        textNormalizer.ts
        stableAttributeFilter.ts
      rendering/
        effectRenderer.ts
        styleRegistry.ts
      storage/
        storageKeys.ts
        ruleRepository.ts
        indexRepository.ts
      retry/
        retryCoordinator.ts
      messaging/
        contracts.ts
        channels.ts
    popup/
      popup.html
      popup.ts
      popup.css
      stateViewModel.ts
  tests/
    unit/
      matcher/
      fingerprinting/
      storage/
      retry/
      messaging/
    integration/
      content-background/
      spa-observer/
    e2e/
      fixtures/
      scenarios/
```

Notes:
- Matcher and renderer are separate modules.
- Storage and indexing are isolated from matching logic.

---

## 2) Exact schemas (Rule / Fingerprint / Settings)

## 2.1 Rule schema

```ts
Rule {
  ruleId: string;                     // UUID v4
  scope: 'page' | 'site';

  domain: string;                     // normalized host, no protocol
  path?: string;                      // normalized path for page scope
  url?: string;                       // optional canonical full URL snapshot

  enabled: boolean;                   // true unless explicitly disabled
  status: 'active' | 'ambiguous' | 'notFound' | 'disabled';

  effect: 'blur' | 'strongBlur' | 'pixelate' | 'blackout' | 'hide';
  intensity: number;                  // 0..100

  fingerprint: Fingerprint;

  createdAt: string;                  // ISO timestamp
  updatedAt: string;                  // ISO timestamp
  lastMatchedAt?: string;             // ISO timestamp
  lastConfidence?: number;            // 0..1

  retryMeta?: {
    autoRetryAttemptsCurrentLoad: number;
    lastRetryAt?: string;
    retryWindowClosedAt?: string;
  };
}
```

## 2.2 Fingerprint schema

```ts
Fingerprint {
  generatedAt: string;                // ISO timestamp
  generationVersion: '1.5';

  // Fast path only (never sufficient alone)
  cssSelector?: string;

  stableId?: {
    value: string;
    confidenceHint: number;           // 0..1
  };

  semanticAttributes: Array<{
    name: string;                     // data-*, aria-*, name, role, type, href, etc.
    valueHash?: string;               // SHA-256 where privacy-sensitive
    rawValue?: string;                // only when non-sensitive + stable
    stabilityHint: number;            // 0..1
  }>;

  stableClasses: Array<{
    className: string;
    stabilityHint: number;            // 0..1
  }>;

  normalizedTextHash?: {
    algorithm: 'SHA-256';
    hash: string;
    sourceLength: number;             // pre-truncation length
    truncatedLength: number;          // hashed normalized prefix length
    stable: boolean;                  // false => excluded from scoring
  };

  ancestorContext: {
    chain: Array<{
      tag: string;
      semanticAttrs: Array<{ name: string; valueHash?: string; rawValue?: string }>;
      stableClasses: string[];
    }>;
    depthCaptured: number;
  };

  structureContext: {
    siblingSignature?: {
      previousTag?: string;
      nextTag?: string;
      indexWithinStableParent?: number;
    };
    childSignature?: {
      stableChildTagsTopK: string[];
      stableChildRolesTopK: string[];
    };
  };

  geometricHint?: {
    viewportXRatio: number;           // 0..1
    viewportYRatio: number;           // 0..1
    widthRatio: number;               // 0..1
    heightRatio: number;              // 0..1
  };

  tagName: string;

  excludedSignals: {
    droppedDynamicIds: string[];
    droppedDynamicClasses: string[];
    droppedVolatileText: boolean;
  };
}
```

## 2.3 Settings schema

```ts
ExtensionSettings {
  extensionEnabled: boolean;
  defaultEffect: 'blur' | 'strongBlur' | 'pixelate' | 'blackout' | 'hide';
  defaultIntensity: number;           // 0..100
  defaultScope: 'page' | 'site';

  selectionMode: {
    active: boolean;
    showIndicator: boolean;
  };

  matcherPolicy: {
    autoApplyThreshold: 0.85;
    ambiguousThreshold: 0.60;
    topGapAmbiguousDelta: 0.05;
    minIndependentCategories: 3;
  };

  retryPolicy: {
    mutationDebounceMs: 150;
    inactivityWindowMs: 5000;
    maxAutoRetryAttemptsPerRulePerLoad: number; // e.g. 5
  };

  ui: {
    showAmbiguousCandidatesV1: boolean;
  };
}
```

---

## 3) Matcher scoring algorithm and decision matrix

## 3.1 Candidate generation
1. Resolve rule scope filter first (domain/page index).
2. Use `cssSelector` as fast candidate seed only.
3. Expand candidate set via stable signals (id, semantic attributes, ancestor anchors).
4. Include open Shadow DOM traversal candidates when available.
5. Exclude cross-origin iframe internals.

## 3.2 Dynamic signal filtering
Treat likely dynamic tokens as non-stable and remove from scoring input:
- IDs/classes with long hash-like segments, timestamp-like suffixes, random GUID patterns, build-chunk markers.
- Volatile text (rapidly changing counters, clocks, dynamic notification numbers).

## 3.3 Weighted independent categories
Scoring is computed by category (0..1 each), then weighted sum, with category independence checks.

Recommended category weights:
- stable ID: **0.26** (high)
- semantic attributes: **0.22** (high)
- normalized text hash (stable only): **0.14** (medium/high)
- stable classes: **0.12** (medium)
- ancestor context: **0.10** (medium)
- structure/siblings: **0.08** (medium)
- css selector exactness: **0.04** (fast path support only)
- dimensions/position: **0.02** (low)
- tag name: **0.02** (low)

Total = 1.00

Independent category counting for auto-apply includes only:
- stable ID
- semantic attributes
- text hash
- stable classes
- ancestor context
- structure/siblings

(`cssSelector`, geometry, tag are excluded from the independence minimum.)

## 3.4 Decision matrix
For the best candidate `C1` and second best `C2`:

1. If no candidate reaches `0.60` => `notFound`.
2. If `0.60 <= score(C1) < 0.85` => `ambiguous`.
3. If `score(C1) >= 0.85` but independent categories < 3 => `ambiguous`.
4. If `score(C1) >= 0.85` and `score(C1)-score(C2) <= 0.05` => `ambiguous`.
5. Else => `active` and auto-apply.

Never auto-apply in `ambiguous` or `notFound`.
Persist confidence and resulting status.

---

## 4) Flow: Selection → Fingerprint → Storage → Apply

1. User enables selection mode in popup.
2. Content script highlights hovered element (non-destructive overlay).
3. On click:
   - prevent page action when possible,
   - collect stable signals,
   - generate `fingerprint` in one operation.
4. Normalize/sanitize text; store only SHA-256 hash for text signal.
5. Build `Rule` with selected scope/effect/intensity, status=`active`, enabled=`true`.
6. Persist in `chrome.storage.local` plus scope indexes.
7. Immediate local match validation on selected element.
8. Apply renderer effect and mark with `data-progettoblur-rule-id`.
9. Notify popup with updated rule/state.

Fallback behavior:
- If fingerprint lacks enough stable signals at creation time, save rule as `ambiguous` and require manual retry/pick.

---

## 5) Flow: Page Load → Load Rules → Match → Apply

1. On content script init (document_idle + SPA route events), request applicable rule IDs by domain/path index.
2. Load only relevant rules (avoid full scan).
3. For each enabled rule:
   - run matcher,
   - compute score and decision.
4. If decision=`active`: apply effect, update `lastMatchedAt/lastConfidence/status`.
5. If `ambiguous` or `notFound`: persist status unchanged and show in popup list.
6. Disabled rules are loaded for display but never matched/applied.

Safety fallback:
- Any uncertainty routes to `ambiguous`/`notFound`, never forced rendering.

---

## 6) MutationObserver strategy (SPA + dynamic DOM)

- One observer per same-origin document/root.
- Observe: `childList`, `subtree`, limited `attributes` (id/class/role/aria/data*/name/type/href).
- Debounce processing: ~150ms.
- Incremental processing only for changed subtrees.
- Priority queue:
  1) `notFound` rules first,
  2) then `ambiguous` only on manual Retry,
  3) skip `disabled`.
- Auto-retry constraints for `notFound`:
  - max attempts per rule per page load,
  - stop after ~5s inactivity window,
  - no infinite loops.
- Manual Retry command always available and bypasses inactivity lock for one explicit pass.

SPA navigation handling:
- Hook `history.pushState`, `replaceState`, `popstate`, and URL change detection.
- On route change, reset per-load retry counters and rerun indexed matching.

---

## 7) Messaging design (popup/content/service worker)

Message channels (typed contract):

- Popup → Service Worker
  - `SET_EXTENSION_ENABLED`
  - `SET_SELECTION_MODE`
  - `CREATE_RULE_FROM_SELECTION_REQUEST`
  - `UPDATE_RULE_EFFECT`
  - `RETRY_RULE`
  - `REMOVE_BLUR_PAGE_ONLY`
  - `DISABLE_RULE`
  - `DELETE_RULE`
  - `GET_RULES_FOR_CURRENT_TAB`

- Service Worker → Content Script
  - `ENTER_SELECTION_MODE`
  - `EXIT_SELECTION_MODE`
  - `APPLY_RULES`
  - `RETRY_RULE_ON_PAGE`
  - `REMOVE_BLUR_BY_RULE_ID_PAGE_ONLY`
  - `REMOVE_ALL_BLURS_PAGE_ONLY`

- Content Script → Service Worker
  - `SELECTION_CAPTURED`
  - `RULE_MATCH_RESULT`
  - `RULE_STATUS_CHANGED`
  - `PAGE_ROUTE_CHANGED`

- Service Worker → Popup
  - `RULE_LIST_UPDATED`
  - `RULE_STATE_UPDATED`
  - `ERROR_STATE`

Design notes:
- Service worker is source of truth for persisted state transitions.
- Content script is source of truth for DOM runtime state.

---

## 8) Lifecycle/state handling

States:
- `active`: rule matched with safe confidence and effect applied.
- `ambiguous`: candidate confidence insufficient or tie too close; not auto-applied.
- `notFound`: no candidate above minimum threshold; not auto-applied.
- `disabled`: user-disabled; retained in storage; no matching/application.

Persistent transitions:
- create rule: `active` (or `ambiguous` if insufficient stable signals immediately)
- active -> ambiguous: match confidence dropped/tie rule triggered
- active -> notFound: no viable candidate
- ambiguous/notFound -> active: explicit Retry or later deterministic high-confidence match
- any -> disabled: user Disable
- disabled -> active/ambiguous/notFound: user Enable then rematch
- any -> deleted: user Delete (hard remove)

Operation semantics (distinct):
- Remove blur: remove rendering from current page only; keep saved rule intact.
- Disable rule: keep rule, set enabled=false/status=disabled, never auto-apply.
- Delete rule: remove rule and indexes permanently.

---

## 9) Responsibilities per module

- `fingerprintGenerator`: produce one-shot fingerprint at selection time.
- `stableAttributeFilter` + `dynamicSignalFilter`: remove volatile/dynamic signals.
- `scoreEngine`: compute weighted per-category confidence.
- `decisionEngine`: apply thresholds + independence + top-gap tie policy.
- `ruleRepository`: CRUD rule persistence in `chrome.storage.local`.
- `indexRepository`: domain/path indexes for scalable loading.
- `ruleApplier`: apply/remove visual effects for matched elements.
- `effectRenderer`: implement blur/pixelate/blackout/hide with isolated CSS strategy.
- `domObserver` + `retryCoordinator`: bounded incremental retry mechanics.
- `selectionController`: hover highlight + click capture + safe interception.
- `iframeCoordinator`: same-origin traversal; cross-origin skip.
- `shadowDomWalker`: open shadow roots traversal only.
- `messageRouter`: strict message validation and routing.

---

## 10) Testing strategy (safety-first)

## 10.1 Unit tests
- Score engine per signal category and weight.
- Decision engine thresholds:
  - >=0.85 with >=3 categories => auto-apply.
  - 0.60..0.85 => ambiguous.
  - <0.60 => notFound.
  - top-gap <=0.05 => ambiguous.
- Dynamic-token filtering accuracy.
- Text normalization/hash behavior (no clear sensitive text persisted).
- Rule/index repository read/write and partition behavior.

## 10.2 Integration tests
- Popup ↔ service worker ↔ content messaging contracts.
- Selection-to-save-to-apply full pipeline.
- State persistence for active/ambiguous/notFound/disabled.
- Remove blur vs Disable vs Delete semantics.
- Retry behavior and bounded auto-retry window.

## 10.3 E2E tests (Edge/Chromium)
- Persist across refresh and browser restart.
- Multi-rule coexistence on same page.
- SPA route changes (React/Vue/Angular-like fixture).
- Same-origin iframe matching; cross-origin iframe graceful skip.
- Open shadow DOM matching; closed shadow DOM documented limitation.
- Ambiguous candidate scenario ensures no auto-apply.

## 10.4 Safety acceptance gates
A change fails acceptance if any test shows:
- auto-application on ambiguous confidence,
- auto-application with <3 independent categories,
- auto-application when top-2 candidate gap <=0.05,
- storage of raw sensitive text from page content.

---

## Technical limits and explicit non-goals
- Cross-origin iframe internal DOM cannot be manipulated due to browser security policy.
- Closed Shadow DOM internals are not accessible.
- Canvas internals are not semantically targetable; only whole canvas element can be obscured.
- CSS selector alone never authorizes auto-apply.

This design is MV3-compatible and targets Edge/Chromium now, with portability to future Chromium browsers.
