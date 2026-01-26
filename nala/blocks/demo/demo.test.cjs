import { expect, test } from '@playwright/test';
import DemoBlock from './demo.page.cjs';
import { features } from './demo.spec.cjs';

let demoBlock;

test.describe('Demo Block Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    demoBlock = new DemoBlock(page);
  });

  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    const { path, data } = features[0];
    const finalUrl = path.startsWith('http') ? path : `${baseURL}${path}`;
    console.info(`[Demo Test] Navigating to: ${finalUrl}`);
    await page.goto(finalUrl);
    await expect(demoBlock.header).toBeVisible();
    await expect(demoBlock.header).toContainText(data.headerText);
  });
});
