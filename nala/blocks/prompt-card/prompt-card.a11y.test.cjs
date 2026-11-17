/* eslint-disable no-restricted-syntax, no-await-in-loop */
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { runAccessibilityTest } = require('../../libs/accessibility.cjs');
const { applyTextSpacing, expectTextNotClipped } = require('../../libs/text-spacing.cjs');
const { pressTab } = require('../../libs/keyboard.cjs');

const root = path.resolve(__dirname, '../../..');
const fixtureURL = 'https://nala.test/prompt-card';
const prompts = ['Summarize this lesson.', 'Create a practice quiz.'];

test.describe('Prompt card accessibility @a11y @prompt-card', () => {
  test.beforeEach(async ({ page }) => {
    // Stub only external Milo helpers and the OS clipboard, not the component under test.
    await page.addInitScript(() => {
      window.copiedPrompts = [];
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.copiedPrompts.push(text); } } });
    });
    await page.route('https://nala.test/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      const files = {
        '/prompt-card': 'nala/blocks/prompt-card/prompt-card.fixture.html',
        '/edu/blocks/prompt-card/prompt-card.js': 'edu/blocks/prompt-card/prompt-card.js',
        '/edu/blocks/prompt-card/prompt-card.css': 'edu/blocks/prompt-card/prompt-card.css',
      };
      if (files[pathname]) {
        await route.fulfill({ path: path.join(root, files[pathname]) });
      } else if (pathname === '/libs/utils/utils.js') {
        await route.fulfill({
          contentType: 'application/javascript',
          body: `export function createTag(tag, attributes, content) {
            const element = document.createElement(tag);
            Object.entries(attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));
            if (content) element.textContent = content;
            return element;
          }`,
        });
      } else if (pathname === '/libs/martech/attributes.js') {
        await route.fulfill({
          contentType: 'application/javascript',
          body: 'export const processTrackingLabels = (text) => text;',
        });
      } else if (pathname === '/edu/img/icons/aichat.svg') {
        await route.fulfill({ path: path.join(root, pathname.slice(1)) });
      } else {
        throw new Error(`Unexpected fixture request: ${route.request().url()}`);
      }
    });
    await page.goto(fixtureURL);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  });

  test('exposes named buttons and a live region before and after keyboard activation @a11y', async ({ page }) => {
    const buttons = page.getByRole('button');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toHaveAccessibleName(`Copy ${prompts[0]}`);
    await expect(buttons.nth(1)).toHaveAccessibleName(`Copy ${prompts[1]}`);
    const announcement = page.locator('.prompt-a11y-action');
    await expect(announcement).toHaveAttribute('aria-live', 'polite');
    await expect(announcement).toBeEmpty();
    await runAccessibilityTest({ page });

    await pressTab(page);
    await expect(page.getByRole('link', { name: 'Before cards' })).toBeFocused();
    await pressTab(page);
    await expect(buttons.nth(0)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(announcement).toHaveText('Lesson prompt copied');
    await page.keyboard.press('Space');
    await expect(announcement).toHaveText('Lesson prompt copied.');
    await expect(buttons.nth(0)).toBeFocused();
    expect(await page.evaluate(() => window.copiedPrompts)).toEqual([prompts[0], prompts[0]]);
    await runAccessibilityTest({ page });
  });

  test('allows tabbing through and back out of the cards @a11y', async ({ page }) => {
    const stops = [
      page.getByRole('link', { name: 'Before cards' }),
      page.getByRole('button', { name: `Copy ${prompts[0]}`, exact: true }),
      page.getByRole('button', { name: `Copy ${prompts[1]}`, exact: true }),
      page.getByRole('link', { name: 'After cards' }),
    ];
    for (const stop of stops) {
      await pressTab(page);
      await expect(stop).toBeFocused();
    }
    for (const stop of stops.slice(0, -1).reverse()) {
      await pressTab(page, true);
      await expect(stop).toBeFocused();
    }
  });

  for (const width of [1280, 375]) {
    test(`retains text and copy functionality with WCAG spacing at ${width}px @a11y`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const text = page.locator('.prompt-prefix span, .prompt-title, .prompt-copy, .prompt-copy-btn');
      await applyTextSpacing(page, text);
      await expectTextNotClipped(text);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await pressTab(page);
      await pressTab(page);
      await expect(page.getByRole('button').nth(0)).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator('.prompt-a11y-action')).toHaveText('Lesson prompt copied');
      expect(await page.evaluate(() => window.copiedPrompts)).toEqual([prompts[0]]);
      await testInfo.attach(`prompt-card-text-spacing-${width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    });
  }
});
