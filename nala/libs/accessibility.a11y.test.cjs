const assert = require('node:assert/strict');
const { test, expect } = require('@playwright/test');
const { runAccessibilityTest } = require('./accessibility.cjs');
const { applyTextSpacing, expectTextNotClipped } = require('./text-spacing.cjs');

test.describe('Accessibility helper regressions @a11y', () => {
  test('scopes axe to a locator and cleans up its marker after passing or failing @a11y', async ({ page }) => {
    await page.setContent('<main><section><button>Named button</button></section><button></button></main>');
    const scope = page.locator('section');
    const results = await runAccessibilityTest({ page, testScope: scope });
    expect(results.violations).toEqual([]);
    await assert.rejects(() => runAccessibilityTest({ page, testScope: page.locator('main') }), /button-name/);
    expect(await scope.evaluate((element) => element.getAttributeNames())).toEqual([]);
    expect(await page.locator('main').evaluate((element) => element.getAttributeNames())).toEqual([]);
  });

  test('accepts wrapping text after applying all four spacing overrides @a11y', async ({ page }) => {
    await page.setContent('<main style="width: 180px"><p>A lesson with several words that can wrap freely.</p></main>');
    const text = page.locator('p');
    await applyTextSpacing(page, text);
    await expectTextNotClipped(text);
  });

  test('detects text clipped by an ancestor after spacing increases @a11y', async ({ page }) => {
    await page.setContent('<main style="height: 30px; overflow: hidden; width: 180px"><p style="margin: 0">A lesson with several words that can wrap freely.</p></main>');
    const text = page.locator('p');
    await applyTextSpacing(page, text);
    await assert.rejects(() => expectTextNotClipped(text), /Text must not be hidden or clipped/);
  });

  test('does not silently pass when expected text is missing or hidden @a11y', async ({ page }) => {
    await page.setContent('<p hidden>Lesson text</p>');
    await assert.rejects(() => expectTextNotClipped(page.locator('p')), /Text must not be hidden or clipped/);
    await assert.rejects(() => expectTextNotClipped(page.locator('h2')), /at least one text element/);
  });
});
