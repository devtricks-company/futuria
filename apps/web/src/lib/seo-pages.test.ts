import { describe, expect, it } from 'vitest';
import { simulate } from '@futuria/engine';
import { decisionModelSchema } from '@futuria/shared';
import { DEMO_SEED } from './demo';
import { SEO_PAGE_LIST, SEO_PAGES } from './seo-pages';

describe('search landing pages', () => {
  it('have unique, URL-safe slugs', () => {
    const slugs = SEO_PAGE_LIST.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('fit search results: short titles, 70-160 character descriptions', () => {
    for (const page of SEO_PAGE_LIST) {
      // " · FUTURIA" is added by the layout's title template.
      expect(page.title.length + ' · FUTURIA'.length, page.slug).toBeLessThanOrEqual(62);
      expect(page.description.length, page.slug).toBeGreaterThanOrEqual(70);
      expect(page.description.length, page.slug).toBeLessThanOrEqual(160);
    }
  });

  it('pre-fill a decision the wizard accepts', () => {
    for (const page of SEO_PAGE_LIST) {
      expect(page.decision.trim().length).toBeGreaterThanOrEqual(5);
      expect(page.decision.length).toBeLessThanOrEqual(1000);
    }
  });

  it('have at least three plain-text FAQs, no duplicates', () => {
    for (const page of SEO_PAGE_LIST) {
      expect(page.faqs.length).toBeGreaterThanOrEqual(3);
      expect(new Set(page.faqs.map((f) => f.q)).size).toBe(page.faqs.length);
      for (const faq of page.faqs) {
        expect(faq.q.trim()).not.toBe('');
        expect(faq.a.trim()).not.toBe('');
      }
    }
  });

  it('simulate valid sample models, with the focus path among their options', () => {
    for (const page of SEO_PAGE_LIST) {
      const model = decisionModelSchema.parse(page.demo.model);
      expect(model.paths.map((p) => p.id)).toContain(page.demo.focusPathId);
    }
  });

  it('tell the startup story: staying is safe, bootstrapping riskier than raising', () => {
    const model = decisionModelSchema.parse(SEO_PAGES.startup.demo.model);
    const runOut = Object.fromEntries(
      simulate(model, { seed: DEMO_SEED }).paths.map((p) => [p.pathId, p.metrics.probRunOut]),
    );
    expect(runOut.stay).toBe(0);
    expect(runOut.bootstrap).toBeGreaterThan(runOut.raise!);
    expect(runOut.bootstrap).toBeGreaterThan(0.1);
    expect(runOut.bootstrap).toBeLessThan(0.6);
  });
});
