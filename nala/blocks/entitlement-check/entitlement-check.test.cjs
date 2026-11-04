const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const fixture = '/test/blocks/entitlement-check/integration.html';
const service = /^https:\/\/edu-org(?:-stage)?\.adobe\.io\/v1\/entitlements$/;

async function open(page) {
  await page.goto(fixture);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Check eligibility', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'College email address' })).toBeVisible();
}

async function freeze(page) {
  const time = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

async function checkAccessibility(page) {
  const results = await new AxeBuilder({ page })
    .include('.entitlement-check-modal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Serve real Milo under the local /libs mount; only the eligibility API is mocked.
  await page.route('**/libs/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `https://main--milo--adobecom.aem.live${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});

[
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 650 },
].forEach(({ name, width, height }) => {
  test(`${name}: validation, rejection, success, accessibility, and dismissal`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let status = 'NOT_ELIGIBLE';
    await page.route(service, (route) => route.fulfill({ json: { status }, headers: { 'access-control-allow-origin': '*' } }));
    await open(page);
    await freeze(page);
    await checkAccessibility(page);
    const input = page.getByRole('textbox', { name: 'College email address' });
    await page.getByRole('button', { name: 'Check eligibility' }).click();
    await expect(page.getByRole('alert')).toHaveText('This field is required.');
    await expect(input).toBeFocused();
    await checkAccessibility(page);
    await input.fill('not-an-email');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
    await input.fill('student@gmail.com');
    await input.press('Enter');
    await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
    await expect(page.getByRole('link', { name: 'Get my free trial' })).toHaveAttribute('href', 'https://www.adobe.com/creativecloud/start-with-free-creativecloud.html');
    await checkAccessibility(page);
    expect(await page.locator('.dialog-modal').evaluate((dialog) => (
      dialog.scrollWidth <= dialog.clientWidth
    ))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Check eligibility', exact: true })).toBeFocused();

    status = 'ELIGIBLE';
    await page.getByRole('link', { name: 'Check eligibility', exact: true }).click();
    await expect(input).toHaveValue('');
    await input.fill('student@School.Example.ORG');
    await input.press('Enter');
    await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'success');
    await expect(page.getByRole('link', { name: 'Not redirected? Continue to Adobe.com.' }))
      .toHaveAttribute('href', 'https://adobe.com/apps/a/school.example.org');
    await expect(page.getByRole('heading', { name: 'Congratulations! You have free access.' })).toBeFocused();
    await checkAccessibility(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.clock.runFor(10000);
    await expect(page).toHaveURL(new RegExp(`${fixture}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('success redirects only after ten seconds to the computed domain', async ({ page }) => {
  await page.route(service, (route) => route.fulfill({ json: { status: 'HAS_ACCESS' }, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://adobe.com/apps/a/school.example.org', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mock destination</title>' }));
  await open(page);
  await freeze(page);
  await page.getByRole('textbox', { name: 'College email address' }).fill('student@school.example.org');
  await page.getByRole('button', { name: 'Check eligibility' }).click();
  await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'success');
  await page.clock.runFor(9999);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(1);
  await expect(page).toHaveURL('https://adobe.com/apps/a/school.example.org');
});

test('technical failure supports retry; backdrop close aborts a pending request', async ({ page }) => {
  let requests = 0;
  await page.route(service, async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
    } else {
      await new Promise((resolve) => {
        route.request().frame().page().once('close', resolve);
        route.request().frame().page().once('requestfailed', resolve);
      });
    }
  });
  await open(page);
  const input = page.getByRole('textbox', { name: 'College email address' });
  await input.fill('student@school.example.org');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Please try again.');
  await expect(input).toHaveValue('student@school.example.org');
  await input.press('Enter');
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await page.locator('.modal-curtain').click({ position: { x: 1, y: 1 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Check eligibility', exact: true }).click();
  await expect(input).toHaveValue('');
});
