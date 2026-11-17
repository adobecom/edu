/* eslint-disable no-restricted-syntax, no-await-in-loop */
const { test, expect } = require('@playwright/test');
const { features } = require('./media.spec.cjs');
const { runAccessibilityTest } = require('../../libs/accessibility.cjs');
const { applyTextSpacing, expectTextNotClipped } = require('../../libs/text-spacing.cjs');
const { pressTab } = require('../../libs/keyboard.cjs');

// Milo can add heading context to CTA names during deferred decoration.
const linkNames = [
  /^Learn More(?: - Heading XS 18\/22 Media \(small\))?$/,
  /^Watch the Video(?: - Heading XS 18\/22 Media \(small\))?$/,
  'Subcopy link 1',
  'Subcopy link 2',
];

async function tabToFirstLink(page, block) {
  const first = block.getByRole('link', { name: linkNames[0] });
  // Global navigation may finish loading before or after the media block.
  for (let index = 0; index < 40; index++) {
    await pressTab(page);
    if (await first.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(first, 'The first media link must be reachable within 40 Tab presses').toBeFocused();
}

async function activateFocusedLink(page, link) {
  await expect(link).toBeFocused();
  const destination = new URL(await link.getAttribute('href'), page.url());
  const requestURL = new URL(destination);
  requestURL.hash = '';
  await page.route(requestURL.href, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Link destination</title>' }));
  await Promise.all([
    page.waitForURL(destination.href),
    page.keyboard.press('Enter'),
  ]);
}

test.describe('Media accessibility @a11y @media', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.goto(`${baseURL}${features[0].path}`);
    await expect(page.locator(features[0].selector)).toBeVisible();
  });

  test('exposes expected accessible headings and link names @a11y', async ({ page }) => {
    const block = page.locator(features[0].selector);
    await expect(block.getByRole('heading', { level: 2 })).toHaveAccessibleName('Heading XS 18/22 Media (small)');
    for (const name of linkNames) {
      await expect(block.getByRole('link', { name, exact: true })).toHaveAccessibleName(name);
    }
    await runAccessibilityTest({ page, testScope: block });
  });

  test('supports forward/reverse tab order and Enter activation @a11y', async ({ page }) => {
    const block = page.locator(features[0].selector);
    await tabToFirstLink(page, block);
    for (const name of linkNames.slice(1)) {
      await pressTab(page);
      await expect(block.getByRole('link', { name, exact: true })).toBeFocused();
    }
    for (const name of linkNames.slice(0, -1).reverse()) {
      await pressTab(page, true);
      await expect(block.getByRole('link', { name, exact: true })).toBeFocused();
    }

    await activateFocusedLink(page, block.getByRole('link', { name: linkNames[0], exact: true }));
  });

  for (const width of [1280, 375]) {
    test(`retains text and keyboard functionality with WCAG spacing at ${width}px @a11y`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const block = page.locator(features[0].selector);
      const text = block.locator('.text p, .text h2, .text h3, .text li');
      await applyTextSpacing(page, text);
      await expectTextNotClipped(text);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await tabToFirstLink(page, block);
      for (const name of linkNames) {
        const link = block.getByRole('link', { name, exact: true });
        if (name !== linkNames[0]) await pressTab(page);
        await expect(link).toBeFocused();
        await expect(link).toHaveAccessibleName(name);
      }
      await testInfo.attach(`media-text-spacing-${width}`, {
        body: await block.screenshot(),
        contentType: 'image/png',
      });
      await activateFocusedLink(page, block.getByRole('link', { name: linkNames[3], exact: true }));
    });
  }
});
