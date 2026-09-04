const STYLE_ID = 'pb-rule-style';
const SVG_ID = 'pb-pixelate-svg';
const ATTR = 'data-progettoblur-rule-id';
const CLASS_PREFIX = 'pb-effect-';

const styleText = `
.pb-effect-base { transition: filter 120ms ease; }
.pb-effect-blur { filter: blur(var(--pb-blur, 6px)) !important; }
.pb-effect-strongBlur { filter: blur(var(--pb-strong-blur, 16px)) !important; }
.pb-effect-pixelate {
  filter: url(#pb-pixelate-filter) !important;
  image-rendering: pixelated !important;
}
.pb-effect-blackout {
  filter: brightness(0) !important;
  color: transparent !important;
  text-shadow: none !important;
}
.pb-effect-hide {
  visibility: hidden !important;
}
.pb-selection-highlight {
  outline: 2px solid #00a3ff !important;
  outline-offset: 1px !important;
  cursor: crosshair !important;
}
`;

const ensureStyleNode = (doc = document) => {
  let styleNode = doc.getElementById(STYLE_ID);
  if (!styleNode) {
    styleNode = doc.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = styleText;
    (doc.head || doc.documentElement).appendChild(styleNode);
  }
};

const ensurePixelSvgFilter = (doc = document) => {
  let svg = doc.getElementById(SVG_ID);
  if (svg) return;

  svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', SVG_ID);
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('style', 'position:absolute');
  svg.innerHTML = `
    <filter id="pb-pixelate-filter">
      <feMorphology operator="dilate" radius="1" />
      <feGaussianBlur stdDeviation="0.1" />
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
        <feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
        <feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" />
      </feComponentTransfer>
    </filter>`;

  (doc.body || doc.documentElement).appendChild(svg);
};

export class EffectRenderer {
  constructor(doc = document) {
    this.doc = doc;
  }

  ensureStyles() {
    ensureStyleNode(this.doc);
    ensurePixelSvgFilter(this.doc);
  }

  applyEffect(element, rule) {
    this.ensureStyles();
    const existingIds = (element.getAttribute(ATTR) || '').split(',').map((v) => v.trim()).filter(Boolean);
    if (!existingIds.includes(rule.ruleId)) {
      existingIds.push(rule.ruleId);
      element.setAttribute(ATTR, existingIds.join(','));
    }

    element.classList.add('pb-effect-base', `${CLASS_PREFIX}${rule.effect}`);

    const px = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    element.style.setProperty('--pb-blur', `${Math.max(1, Math.round((px / 100) * 12))}px`);
    element.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round((px / 100) * 28))}px`);
  }

  removeEffect(element, rule) {
    const ids = (element.getAttribute(ATTR) || '').split(',').map((v) => v.trim()).filter(Boolean);
    const next = ids.filter((id) => id !== rule.ruleId);

    if (next.length === 0) {
      element.removeAttribute(ATTR);
      element.classList.remove('pb-effect-base');
      for (const effect of ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide']) {
        element.classList.remove(`${CLASS_PREFIX}${effect}`);
      }
      element.style.removeProperty('--pb-blur');
      element.style.removeProperty('--pb-strong-blur');
      return;
    }

    element.setAttribute(ATTR, next.join(','));
  }

  removeByRuleId(ruleId, root = this.doc) {
    for (const element of root.querySelectorAll(`[${ATTR}]`)) {
      const ids = (element.getAttribute(ATTR) || '').split(',').map((value) => value.trim()).filter(Boolean);
      if (!ids.includes(ruleId)) continue;
      this.removeEffect(element, { ruleId });
    }
  }

  removeAll(root = this.doc) {
    for (const element of root.querySelectorAll(`[${ATTR}]`)) {
      element.removeAttribute(ATTR);
      element.classList.remove('pb-effect-base', 'pb-effect-blur', 'pb-effect-strongBlur', 'pb-effect-pixelate', 'pb-effect-blackout', 'pb-effect-hide');
      element.style.removeProperty('--pb-blur');
      element.style.removeProperty('--pb-strong-blur');
    }
  }
}
