import { describe, expect, it } from 'vitest';

import { decideMatch } from '../../../src/core/matcher/decisionEngine.js';
import { rankCandidates } from '../../../src/core/matcher/scoreEngine.js';
import { sampleRule } from '../helpers/sampleRule.js';

const MIN_CATEGORY_CONTRIBUTION = 0.65;

describe('score + decision engine', () => {
  it('auto-applies only for score >= 0.85 with >=3 independent categories and safe top gap', () => {
    const rule = sampleRule();
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [
        {
          candidateId: 'a',
          tagName: 'section',
          id: 'settings-panel',
          semanticAttributes: [
            { name: 'role', valueKind: 'structural', value: 'region' },
            { name: 'aria-label', valueKind: 'hash', value: 'a'.repeat(64) }
          ],
          classNames: ['panel', 'secure'],
          normalizedTextHash: 'b'.repeat(64),
          ancestorContext: rule.fingerprint.ancestorContext,
          structureContext: rule.fingerprint.structureContext,
          geometricHint: rule.fingerprint.geometricHint,
          cssSelectorMatched: true
        },
        {
          candidateId: 'b',
          tagName: 'section',
          id: 'other-id',
          semanticAttributes: [{ name: 'role', valueKind: 'structural', value: 'region' }],
          classNames: ['panel'],
          ancestorContext: rule.fingerprint.ancestorContext,
          structureContext: {},
          cssSelectorMatched: false
        }
      ]
    });

    const decision = decideMatch(rule, ranked, {
      autoApplyThreshold: 0.85,
      ambiguousThreshold: 0.6,
      topGapAmbiguousDelta: 0.05,
      minIndependentCategories: 3
    });

    expect(ranked.c1?.independentContributions).toBeGreaterThanOrEqual(3);
    expect(decision.status).toBe('active');
    expect(decision.reason).toBe('safe-auto-apply');
  });

  it('is ambiguous when top two candidates are too close even above threshold', () => {
    const rule = sampleRule();

    const candidates = [
      {
        candidateId: 'a',
        tagName: 'section',
        id: 'settings-panel',
        semanticAttributes: [
          { name: 'role', valueKind: 'structural', value: 'region' },
          { name: 'aria-label', valueKind: 'hash', value: 'a'.repeat(64) }
        ],
        classNames: ['panel', 'secure'],
        normalizedTextHash: 'b'.repeat(64),
        ancestorContext: rule.fingerprint.ancestorContext,
        structureContext: rule.fingerprint.structureContext,
        geometricHint: rule.fingerprint.geometricHint,
        cssSelectorMatched: true
      },
      {
        candidateId: 'b',
        tagName: 'section',
        id: 'settings-panel',
        semanticAttributes: [
          { name: 'role', valueKind: 'structural', value: 'region' },
          { name: 'aria-label', valueKind: 'hash', value: 'a'.repeat(64) }
        ],
        classNames: ['panel', 'secure'],
        normalizedTextHash: 'b'.repeat(64),
        ancestorContext: rule.fingerprint.ancestorContext,
        structureContext: rule.fingerprint.structureContext,
        geometricHint: rule.fingerprint.geometricHint,
        cssSelectorMatched: true
      }
    ];

    const ranked = rankCandidates({ rule, candidates, minCategoryContribution: MIN_CATEGORY_CONTRIBUTION });

    const decision = decideMatch(rule, ranked, {
      autoApplyThreshold: 0.85,
      ambiguousThreshold: 0.6,
      topGapAmbiguousDelta: 0.05,
      minIndependentCategories: 3
    });

    expect(Math.abs((ranked.c1?.totalScore ?? 0) - (ranked.c2?.totalScore ?? 0))).toBeLessThanOrEqual(0.05);
    expect(decision.status).toBe('ambiguous');
    expect(decision.reason).toBe('top-candidates-too-close');
  });

  it('renormalizes over available categories when others are unavailable', () => {
    const rule = sampleRule();
    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: [
        {
          candidateId: 'a',
          tagName: 'section',
          semanticAttributes: [{ name: 'role', valueKind: 'structural', value: 'region' }],
          classNames: [],
          ancestorContext: { chain: [], depthCaptured: 0 },
          structureContext: {},
          cssSelectorMatched: false
        }
      ]
    });

    expect(ranked.c1).toBeDefined();
    expect(ranked.c1?.totalScore).toBeGreaterThan(0);

    const decision = decideMatch(rule, ranked, {
      autoApplyThreshold: 0.85,
      ambiguousThreshold: 0.6,
      topGapAmbiguousDelta: 0.05,
      minIndependentCategories: 3
    });

    expect(decision.status === 'ambiguous' || decision.status === 'notFound').toBe(true);
  });

  it('returns disabled when rule is not enabled', () => {
    const rule = sampleRule();
    rule.enabled = false;

    const ranked = rankCandidates({
      rule,
      minCategoryContribution: MIN_CATEGORY_CONTRIBUTION,
      candidates: []
    });

    const decision = decideMatch(rule, ranked, {
      autoApplyThreshold: 0.85,
      ambiguousThreshold: 0.6,
      topGapAmbiguousDelta: 0.05,
      minIndependentCategories: 3
    });

    expect(decision.status).toBe('disabled');
  });
});
