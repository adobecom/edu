const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const fixture = '/test/blocks/entitlement-check/integration.html';
const service = /^https:\/\/edu-org(?:-stage)?\.adobe\.io\/v1\/entitlements$/;

async function open(page) {
  await page.goto(fixture);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('link', { name: 'Check eligibility', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'College email address' })).toBeVisible();
  await expect(page.locator('.entitlement-check')).toHaveCSS('text-align', 'center');
  await page.evaluate(() => document.fonts.ready);
}

async function freeze(page) {
  const time = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

async function checkAccessibility(page, scope = '.entitlement-check-modal') {
  const results = await new AxeBuilder({ page })
    .include(scope)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function formLayout(page) {
  return page.locator('.entitlement-check-modal').evaluate((modal) => ({
    height: modal.getBoundingClientRect().height,
    legal: modal.querySelector('.entitlement-check-legal').getBoundingClientRect().top,
    submit: modal.querySelector('.entitlement-check-submit').getBoundingClientRect().top,
  }));
}

async function relativeBox(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const modal = element.closest('.entitlement-check-modal').getBoundingClientRect();
    return { x: box.x - modal.x, y: box.y - modal.y, width: box.width, height: box.height };
  });
}

[
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 650 },
].forEach(({ name, width, height }) => {
  test(`${name}: standalone page supports validation, loading, retry, results, and manual navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let pendingRoute;
    let requests = 0;
    await page.route(service, (route) => {
      requests += 1;
      pendingRoute = route;
    });
    await page.route('https://adobe.com/apps/a/school.example.org', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mock destination</title>' }));
    const loadInline = async () => {
      await page.goto(`${fixture}?inline`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'form');
      await page.evaluate(() => document.fonts.ready);
    };
    await loadInline();
    const block = page.locator('.entitlement-check');
    const input = block.getByRole('textbox', { name: 'College email address' });
    const consent = block.getByRole('checkbox');
    const submit = block.locator('.entitlement-check-submit');
    const progress = block.locator('.spectrum-ProgressCircle');
    const error = block.getByRole('alert');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.entitlement-check-modal')).toHaveCount(0);
    expect((await block.boundingBox()).width).toBeLessThanOrEqual(715);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await checkAccessibility(page, '.entitlement-check');
    await submit.click();
    await expect(error).toHaveText('This field is required.');
    await input.fill('not-an-email');
    await submit.click();
    await expect(error).toHaveText('Enter a valid email address.');
    await input.fill('student@school.example.org');
    await submit.click();
    await expect(error).toHaveText('Please select the checkbox to continue.');
    await expect(consent).toBeFocused();
    expect(requests).toBe(0);
    await checkAccessibility(page, '.entitlement-check');
    await page.keyboard.press('Space');
    const initial = await submit.boundingBox();
    await submit.click();
    await expect(progress).toBeVisible();
    await expect(block.locator('.entitlement-check-submit-label')).toBeHidden();
    await expect(submit).toHaveAccessibleName('Check eligibility');
    await expect(block.locator('form')).toHaveAttribute('aria-busy', 'true');
    const loading = await submit.boundingBox();
    expect(loading.width).toBe(initial.width);
    expect(loading.height).toBe(initial.height);
    const circle = await progress.boundingBox();
    expect(circle.x + circle.width / 2).toBeCloseTo(loading.x + loading.width / 2, 1);
    expect(circle.y + circle.height / 2).toBeCloseTo(loading.y + loading.height / 2, 1);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('milo:modal:closed', { detail: { id: 'unrelated-modal' } })));
    await expect(block.locator('form')).toHaveAttribute('aria-busy', 'true');
    await checkAccessibility(page, '.entitlement-check');
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await pendingRoute.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
    await expect(error).toContainText('Please try again.');
    await expect(consent).toBeChecked();
    await expect(submit).toBeEnabled();
    await expect(progress).toBeHidden();
    pendingRoute = undefined;
    await submit.click();
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await pendingRoute.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } });
    await expect(block).toHaveAttribute('data-state', 'rejected');
    await expect(block.getByRole('heading')).toBeFocused();
    await expect(block.getByRole('link', { name: 'Get my free trial' })).toBeVisible();
    await checkAccessibility(page, '.entitlement-check');
    pendingRoute = undefined;
    await loadInline();
    await input.fill('student@School.Example.ORG');
    await consent.check();
    await submit.click();
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await pendingRoute.fulfill({ json: { status: 'ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } });
    await expect(block).toHaveAttribute('data-state', 'success');
    await expect(block.getByRole('heading')).toBeFocused();
    const continuation = block.getByRole('link', { name: 'Continue to Adobe' });
    await expect(continuation).toHaveAttribute('href', 'https://adobe.com/apps/a/school.example.org');
    await checkAccessibility(page, '.entitlement-check');
    await freeze(page);
    await page.clock.runFor(60000);
    await expect(page).toHaveURL(new RegExp(`${fixture}\\?inline$`));
    await expect(block).toHaveAttribute('data-state', 'success');
    await continuation.click();
    await expect(page).toHaveURL('https://adobe.com/apps/a/school.example.org');
  });
});

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
    let requests = 0;
    await page.route(service, (route) => {
      requests += 1;
      return route.fulfill({ json: { status }, headers: { 'access-control-allow-origin': '*' } });
    });
    await open(page);
    await checkAccessibility(page);
    const layout = await formLayout(page);
    const mobile = name === 'mobile';
    const modalBox = await page.locator('.entitlement-check-modal').boundingBox();
    expect(modalBox.width).toBe(mobile ? 338 : 715);
    expect(layout.height).toBe(mobile ? 511 : 415);
    const inputBox = await relativeBox(page, '.entitlement-check input[type="email"]');
    expect(inputBox.x).toBe(mobile ? 19 : 52);
    expect(inputBox.y).toBe(mobile ? 232 : 194);
    expect(inputBox.height).toBe(40);
    const submitBox = await relativeBox(page, '.entitlement-check-submit');
    expect(submitBox.y).toBe(mobile ? 437 : 341);
    expect(submitBox.height).toBe(38);
    const input = page.getByRole('textbox', { name: 'College email address' });
    const consent = page.getByRole('checkbox');
    await expect(consent).not.toBeChecked();
    await expect(consent).toHaveAccessibleName(/^I agree that Adobe family of companies/);
    const consentBox = await relativeBox(page, '.entitlement-check-consent-input');
    const legalBox = await relativeBox(page, '.entitlement-check-legal');
    expect(consentBox.width).toBe(12);
    expect(consentBox.height).toBe(12);
    expect(legalBox.height).toBe(mobile ? 81 : 45);
    await page.getByRole('button', { name: 'Check eligibility' }).click();
    await expect(page.getByRole('alert')).toHaveText('This field is required.');
    await expect(input).toBeFocused();
    expect(await formLayout(page)).toEqual(layout);
    await checkAccessibility(page);
    await input.fill('not-an-email');
    expect(await formLayout(page)).toEqual(layout);
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
    await consent.check();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
    await consent.uncheck();
    await input.fill('student+tag@GMAIL.COM');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Make sure to use your school email, not your personal email.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();
    expect(requests).toBe(0);
    expect(await formLayout(page)).toEqual(layout);
    await checkAccessibility(page);
    await input.fill('student@school.example.org');
    await expect(page.locator('.entitlement-check-error')).toBeHidden();
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Please select the checkbox to continue.');
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(consent).toHaveAttribute('aria-invalid', 'true');
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    await expect(consent).toBeFocused();
    expect(requests).toBe(0);
    expect(await formLayout(page)).toEqual(layout);
    await checkAccessibility(page);
    await page.keyboard.press('Space');
    await expect(consent).toBeChecked();
    await expect(page.getByRole('alert')).toBeHidden();
    await page.getByRole('button', { name: 'Check eligibility' }).click();
    await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
    await expect(page.getByRole('link', { name: 'Get my free trial' })).toHaveAttribute('href', 'https://www.adobe.com/creativecloud/start-with-free-creativecloud.html');
    const trialBox = await relativeBox(page, '.entitlement-check-trial');
    expect(trialBox.y).toBe(mobile ? 278 : 229);
    expect(trialBox.width).toBe(153);
    expect(trialBox.height).toBe(40);
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
    await expect(consent).not.toBeChecked();
    await input.fill('student@School.Example.ORG');
    await consent.check();
    await input.press('Enter');
    await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'success');
    await expect(page.getByRole('link', { name: 'Continue to Adobe' }))
      .toHaveAttribute('href', 'https://adobe.com/apps/a/school.example.org');
    await expect(page.getByRole('heading', { name: 'Congratulations! You have free access.' })).toBeFocused();
    const title = page.locator('.entitlement-check-heading');
    const titleBox = await relativeBox(page, '.entitlement-check-heading');
    expect(titleBox.y).toBe(mobile ? 136 : 123);
    expect(titleBox.height).toBe(mobile ? 60 : 35);
    const lineOffset = await title.evaluate((heading) => {
      const lead = heading.querySelector('.entitlement-check-heading-lead');
      const first = document.createRange();
      first.selectNodeContents(lead);
      const rest = document.createRange();
      rest.selectNodeContents(heading);
      rest.setStartAfter(lead);
      return rest.getBoundingClientRect().y - first.getBoundingClientRect().y;
    });
    expect(lineOffset).toBe(mobile ? 30 : 0);
    const continuation = page.locator('.entitlement-check-continue');
    await expect(continuation).toHaveText('Continue to Adobe');
    await expect(continuation).toHaveCSS('text-decoration-line', 'none');
    await expect(continuation).toHaveCSS('background-color', 'rgb(59, 99, 251)');
    await expect(continuation).toHaveCSS('color', 'rgb(255, 255, 255)');
    const continueBox = await relativeBox(page, '.entitlement-check-continue');
    expect(continueBox.y).toBe(mobile ? 296 : 228);
    expect(continueBox.width).toBe(170);
    expect(continueBox.height).toBe(40);
    expect((await page.locator('.entitlement-check-modal').boundingBox()).height).toBe(mobile ? 408 : 350);
    await checkAccessibility(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${fixture}$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('long validation copy remains reachable on a narrow, short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  const message = 'Please enter your college email address to check eligibility. '.repeat(8).trim();
  await page.route('**/test/blocks/entitlement-check/fragment.plain.html', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('This field is required.', message);
    await route.fulfill({ response, body });
  });
  await open(page);
  const slot = page.locator('.entitlement-check-error-slot');
  const initialHeight = await slot.evaluate((element) => element.clientHeight);
  await page.getByRole('button', { name: 'Check eligibility' }).click();
  await expect(page.getByRole('alert')).toHaveText(message);
  expect(await slot.evaluate((element) => element.clientHeight)).toBeGreaterThan(initialHeight);
  const submit = page.getByRole('button', { name: 'Check eligibility' });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  expect(await page.locator('.dialog-modal').evaluate((modal) => (
    modal.scrollWidth <= modal.clientWidth
  ))).toBe(true);
});

test('success remains on the page until its CTA is activated with the keyboard', async ({ page }) => {
  await page.route(service, (route) => route.fulfill({ json: { status: 'HAS_ACCESS' }, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://adobe.com/apps/a/school.example.org', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mock destination</title>' }));
  await open(page);
  await freeze(page);
  await page.getByRole('textbox', { name: 'College email address' }).fill('student@school.example.org');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Check eligibility' }).click();
  await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'success');
  await page.clock.runFor(60000);
  await expect(page).toHaveURL(new RegExp(`${fixture}#eligibility-modal$`));
  await expect(page.getByRole('dialog')).toBeVisible();
  const continuation = page.getByRole('link', { name: 'Continue to Adobe' });
  await page.keyboard.press('Tab');
  await expect(continuation).toBeFocused();
  await page.keyboard.press('Enter');
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
  await page.getByRole('checkbox').check();
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Please try again.');
  await expect(input).toHaveValue('student@school.example.org');
  await expect(page.getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('checkbox')).toBeEnabled();
  await input.press('Enter');
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await page.locator('.modal-curtain').click({ position: { x: 1, y: 1 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Check eligibility', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
});

[
  { name: 'desktop', width: 1440, height: 900, motion: 'no-preference' },
  { name: 'tablet', width: 768, height: 1024, motion: 'reduce' },
  { name: 'mobile', width: 390, height: 650, motion: 'reduce', forcedColors: true },
].forEach(({ name, width, height, motion, forcedColors }) => {
  test(`${name}: CSS-only submission indicator preserves CTA layout and accessibility`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: motion });
    let pendingRoute;
    await page.route(service, (route) => { pendingRoute = route; });
    await open(page);
    const input = page.getByRole('textbox', { name: 'College email address' });
    const submit = page.locator('.entitlement-check-submit');
    const progress = submit.locator('.spectrum-ProgressCircle');
    const label = submit.locator('.entitlement-check-submit-label');
    const dimensions = ({ width: w, height: h }) => ({ width: w, height: h });
    const initial = dimensions(await submit.boundingBox());
    await expect(progress).toBeHidden();
    await input.fill('student@school.example.org');
    await page.getByRole('checkbox').check();
    await submit.click();
    await expect(progress).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('checkbox')).toBeDisabled();
    await expect(submit).toHaveAccessibleName('Check eligibility');
    await expect(progress).toHaveAttribute('aria-hidden', 'true');
    await expect(label).toBeHidden();
    await expect(label).toHaveText('Check eligibility');
    await expect(page.locator('.entitlement-check').getByRole('status')).toHaveCount(0);
    expect(dimensions(await submit.boundingBox())).toEqual(initial);
    const indicator = await relativeBox(page, '.spectrum-ProgressCircle');
    const button = await relativeBox(page, '.entitlement-check-submit');
    expect(indicator.width).toBe(20);
    expect(indicator.height).toBe(20);
    expect(indicator.x + indicator.width / 2).toBeCloseTo(button.x + button.width / 2, 1);
    expect(indicator.y + indicator.height / 2).toBeCloseTo(button.y + button.height / 2, 1);
    const containedMasks = await progress.locator('.spectrum-ProgressCircle-fillMask1, .spectrum-ProgressCircle-fillMask2')
      .evaluateAll((elements) => elements.map((element) => {
        const circle = element.closest('.spectrum-ProgressCircle');
        return element.offsetLeft >= 0 && element.offsetTop >= 0
          && element.offsetLeft + element.offsetWidth <= circle.clientWidth
          && element.offsetTop + element.offsetHeight <= circle.clientHeight;
      }));
    expect(containedMasks).toEqual([true, true]);
    const animations = await progress.locator('.spectrum-ProgressCircle-fills, .spectrum-ProgressCircle-fillSubMask1, .spectrum-ProgressCircle-fillSubMask2')
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
    if (motion === 'reduce') expect(animations).toEqual(['none', 'none', 'none']);
    else animations.forEach((animation) => expect(animation).toMatch(/^entitlement-check-progress-/));
    await checkAccessibility(page);
    if (forcedColors) {
      await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
      await expect(progress.locator('.spectrum-ProgressCircle-fill').first()).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
      await expect(progress.locator('.spectrum-ProgressCircle-track')).toHaveCSS('border-top-style', 'double');
      await expect(progress).toBeVisible();
    }
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await pendingRoute.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
    await expect(page.getByRole('alert')).toContainText('Please try again.');
    await expect(progress).toBeHidden();
    await expect(label).toHaveCSS('visibility', 'visible');
    await expect(label).toHaveText('Check eligibility');
    await expect(submit).toHaveAccessibleName('Check eligibility');
    await expect(submit).toBeEnabled();
    await expect(page.getByRole('checkbox')).toBeChecked();
    await expect(page.getByRole('checkbox')).toBeEnabled();
    expect(dimensions(await submit.boundingBox())).toEqual(initial);
    pendingRoute = undefined;
    await submit.click();
    await expect(progress).toBeVisible();
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await pendingRoute.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } });
    await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
  });
});
