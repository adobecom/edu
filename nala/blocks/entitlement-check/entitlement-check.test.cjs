const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const fixture = '/test/blocks/entitlement-check/integration.html';
const service = /^https:\/\/edu-org(?:-stage)?\.adobe\.io\/v1\/entitlements$/;
const adobeDestination = /^https:\/\/www\.(?:stage\.)?adobe\.com\/home\/a\//;
const stageDestination = 'https://www.stage.adobe.com/home/a/school.example.org?pa_code=PA-2300';
const stageBrowserDestination = stageDestination;
const progressModule = '**/libs/features/spectrum-web-components/dist/progress-circle.js';

async function open(page, query = '') {
  await page.goto(`${fixture}${query}`);
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

async function captureAnalytics(page) {
  await page.addInitScript(() => {
    window.entitlementAnalytics = [];
    window.entitlementClicks = [];
    // eslint-disable-next-line no-underscore-dangle
    window._satellite = { track: (type, payload) => window.entitlementAnalytics.push({ type, payload }) };
    document.addEventListener('click', (event) => {
      const control = event.target.closest('[daa-ll]');
      if (control) {
        window.entitlementClicks.push({
          label: control.getAttribute('daa-ll'),
          defaultPrevented: event.defaultPrevented,
        });
      }
    });
  });
}

async function getAnalytics(page) {
  return page.evaluate(() => window.entitlementAnalytics.filter(({ payload }) => {
    const name = payload?.xdm?.web?.webInteraction?.name;
    return name?.startsWith('ar_') || name?.startsWith('entitlement-check:');
  }));
}

async function captureNavigation(page, onNavigation) {
  const prefix = 'entitlement-navigation:';
  page.on('console', (message) => {
    const value = message.text();
    if (value.startsWith(prefix)) onNavigation(JSON.parse(value.slice(prefix.length)));
  });
  await page.addInitScript((marker) => {
    let destination;
    window.navigation.addEventListener('navigate', (event) => {
      destination = event.destination.url;
    });
    window.addEventListener('beforeunload', () => {
      const snapshot = {
        destination,
        state: document.querySelector('.entitlement-check')?.dataset.state,
        result: Boolean(document.querySelector('.entitlement-check-result')),
        cta: Boolean(document.querySelector('.entitlement-check-continue')),
        events: (window.entitlementAnalytics || []).filter(
          ({ payload }) => {
            const name = payload?.xdm?.web?.webInteraction?.name;
            return name?.startsWith('ar_') || name?.startsWith('entitlement-check:');
          },
        ),
        clicks: window.entitlementClicks || [],
      };
      // eslint-disable-next-line no-console
      console.info(`${marker}${JSON.stringify(snapshot)}`);
    });
  }, prefix);
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

test('preloads the shared indicator without delaying the standalone form or eligibility request', async ({ page }) => {
  let indicatorRoute;
  let pendingRoute;
  await page.route(progressModule, (route) => { indicatorRoute = route; });
  await page.route(service, (route) => { pendingRoute = route; });
  await page.goto(`${fixture}?inline`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => Boolean(indicatorRoute)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const submit = page.locator('.entitlement-check-submit');
  const label = submit.locator('.entitlement-check-submit-label');
  const progress = submit.locator('sp-progress-circle');
  const initial = await submit.boundingBox();
  await page.getByRole('textbox').fill('student@school.example.org');
  await submit.click();
  await expect.poll(() => Boolean(pendingRoute)).toBe(true);
  await expect(page.locator('.entitlement-check form')).toHaveAttribute('aria-busy', 'true');
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAccessibleName('Check eligibility');
  await expect(progress).toBeHidden();
  await expect(label).toBeVisible();
  await indicatorRoute.fallback();
  await expect(progress).toBeVisible();
  await expect(progress.locator('.track')).toBeVisible();
  await expect(label).toBeHidden();
  const loading = await submit.boundingBox();
  expect(loading.width).toBe(initial.width);
  expect(loading.height).toBe(initial.height);
  await pendingRoute.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
  await expect(page.getByRole('alert')).toContainText('Please try again.');
  await expect(progress).toBeHidden();
  await expect(label).toBeVisible();
  await expect(submit).toBeEnabled();
});

test('keeps the authored label and eligibility usable when the shared indicator fails to load', async ({ page }) => {
  await page.addInitScript(() => {
    window.entitlementErrors = [];
    window.lana = {
      log(message, options) {
        window.entitlementErrors.push({ message, options });
      },
    };
  });
  await page.route(progressModule, (route) => route.abort());
  let pendingRoute;
  await page.route(service, (route) => { pendingRoute = route; });
  await open(page);
  await expect.poll(() => page.evaluate(() => window.entitlementErrors)).toEqual([{
    message: 'Entitlement check: progress indicator initialization failed',
    options: { tags: 'entitlement-check', severity: 'error' },
  }]);
  await page.getByRole('textbox').fill('student@school.example.org');
  const submit = page.locator('.entitlement-check-submit');
  await submit.click();
  await expect.poll(() => Boolean(pendingRoute)).toBe(true);
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAccessibleName('Check eligibility');
  await expect(submit.locator('.entitlement-check-submit-label')).toBeVisible();
  await expect(submit.locator('sp-progress-circle')).toBeHidden();
  await pendingRoute.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } });
  await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
});

['rejection', 'modal closure'].forEach((outcome) => {
  test(`does not initialize a stale indicator after ${outcome}`, async ({ page }) => {
    let indicatorRoute;
    await page.route(progressModule, (route) => { indicatorRoute = route; });
    await page.route(service, (route) => route.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } }));
    await open(page);
    await expect.poll(() => Boolean(indicatorRoute)).toBe(true);
    const progress = await page.locator('sp-progress-circle').elementHandle();
    if (outcome === 'rejection') {
      await page.getByRole('textbox').fill('student@school.example.org');
      await page.locator('.entitlement-check-submit').click();
      await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
    } else {
      await page.locator('.dialog-close').click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await indicatorRoute.fallback();
    await page.evaluate(async () => {
      await Promise.all([
        customElements.whenDefined('sp-theme'),
        customElements.whenDefined('sp-progress-circle'),
      ]);
      await new Promise((resolve) => { requestAnimationFrame(resolve); });
    });
    expect(await progress.evaluate((element) => ({ connected: element.isConnected, hidden: element.hidden, rendered: Boolean(element.shadowRoot) }))).toEqual({ connected: false, hidden: true, rendered: false });
    if (outcome === 'rejection') {
      await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
    } else {
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
});

[
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 650 },
].forEach(({ name, width, height }) => {
  test(`${name}: standalone page supports validation, loading, retry, rejection, and immediate redirect`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    let pendingRoute;
    let requests = 0;
    await page.route(service, (route) => {
      requests += 1;
      pendingRoute = route;
    });
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
    const progress = block.locator('sp-progress-circle');
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
    await expect(consent).not.toBeChecked();
    await expect(consent).toHaveJSProperty('required', false);
    expect(requests).toBe(0);
    await checkAccessibility(page, '.entitlement-check');
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
    await expect(consent).not.toBeChecked();
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
    await expect(page).toHaveURL(stageBrowserDestination);
  });
});

test.beforeEach(async ({ page }) => {
  // Serve real Milo under /libs; mock eligibility requests and Adobe navigation.
  await page.route('**/libs/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `https://main--milo--adobecom.aem.live${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.route(adobeDestination, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Mock destination</title>',
  }));
});

test.afterEach(async ({ page }) => {
  // Background imports may still be proxied when the fixture is closed.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

[
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 650 },
].forEach(({ name, width, height }) => {
  test(`${name}: validation, rejection, immediate redirect, accessibility, and dismissal`, async ({ page }) => {
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
    await expect(consent).not.toBeChecked();
    await expect(consent).toHaveJSProperty('required', false);
    expect(requests).toBe(0);
    expect(await formLayout(page)).toEqual(layout);
    await checkAccessibility(page);
    await input.press('Enter');
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
    await expect(page).toHaveURL(stageBrowserDestination);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

['delayed', 'unavailable'].forEach((analyticsState) => {
  test(`standalone form renders and submits when the analytics helper is ${analyticsState}`, async ({ page }) => {
    await captureAnalytics(page);
    const pendingRoutes = [];
    await page.route('**/libs/martech/helpers.js', (route) => {
      if (analyticsState === 'unavailable') return route.abort();
      pendingRoutes.push(route);
      return undefined;
    });
    await page.route(service, (route) => route.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } }));
    try {
      await page.goto(`${fixture}?inline`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('textbox', { name: 'College email address' })).toBeVisible();
      await page.getByRole('textbox', { name: 'College email address' }).fill('student@school.example.org');
      await page.getByRole('button', { name: 'Check eligibility' }).click();
      await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
      await expect.poll(async () => (await getAnalytics(page)).map(({ payload }) => payload.xdm.web.webInteraction.name))
        .toEqual(['ar_not_eligible']);
    } finally {
      await Promise.all(pendingRoutes.map((route) => route.abort()));
    }
  });
});

['modal', 'inline'].forEach((mode) => {
  test(`${mode}: analytics tracks the eligibility funnel and errors without form contents`, async ({ page }) => {
    let eligibleEvents;
    await captureNavigation(page, ({ events }) => { eligibleEvents = events; });
    await captureAnalytics(page);
    let status = 'NOT_ELIGIBLE';
    await page.route(service, (route) => route.fulfill({ json: { status }, headers: { 'access-control-allow-origin': '*' } }));
    const loadForm = async () => {
      if (mode === 'modal') {
        await open(page);
      } else {
        await page.goto(`${fixture}?inline`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'form');
      }
    };
    const getEvents = () => getAnalytics(page);
    const getNames = async () => (await getEvents()).map(({ payload }) => payload.xdm.web.webInteraction.name);
    await loadForm();
    const input = page.getByRole('textbox', { name: 'College email address' });
    const consent = page.getByRole('checkbox');
    const submit = page.getByRole('button', { name: 'Check eligibility' });
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('This field is required.');
    expect(await getNames()).toEqual([]);
    await input.fill('not-an-email');
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
    expect(await getNames()).toEqual([]);
    await input.fill('student@gmail.com');
    await submit.click();
    await expect(page.getByRole('alert')).toHaveText('Make sure to use your school email, not your personal email.');
    await input.fill('student@school.example.org');
    await submit.click();
    await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
    await expect.poll(getNames, { timeout: 15000 }).toEqual([
      'ar_email_personal_warning',
      'ar_not_eligible',
    ]);
    const rejectedEvents = await getEvents();
    status = 'ELIGIBLE';
    await loadForm();
    await input.fill('student@school.example.org');
    await consent.check();
    await expect.poll(getNames, { timeout: 15000 }).toEqual([
      'ar_check_click',
    ]);
    await submit.click();
    await expect(page).toHaveURL(stageBrowserDestination);
    await expect.poll(() => eligibleEvents?.map(({ payload }) => payload.xdm.web.webInteraction.name)).toEqual([
      'ar_check_click',
      'ar_eligible',
    ]);
    const events = [...rejectedEvents, ...eligibleEvents];
    events.forEach(({ type, payload }) => {
      expect(type).toBe('event');
      expect(payload.documentUnloading).toBe(true);
      expect(payload.xdm.eventType).toBe('web.webinteraction.linkClicks');
      const { _adobe_corpnew: adobeData } = payload.data;
      expect(payload.xdm.web.webInteraction.name)
        .toBe(adobeData.digitalData.primaryEvent.eventInfo.eventName);
    });
    const serialized = JSON.stringify(events);
    ['student@', 'school.example.org', 'gmail.com', 'not-an-email', 'Enter a valid email address.'].forEach((value) => {
      expect(serialized).not.toContain(value);
    });
  });

  ['click', 'Enter'].forEach((activation) => {
    test(`${mode}: rejected CTA tracks ${activation} without suppressing navigation or Milo click labels`, async ({ page }) => {
      await captureAnalytics(page);
      let beforeNavigation;
      await captureNavigation(page, (state) => { beforeNavigation = state; });
      await page.route('**/test/blocks/entitlement-check/fragment.plain.html', async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace('>Get my free trial</a>', ' daa-ll="authored-trial">Explore plans</a>');
        await route.fulfill({ response, body });
      });
      const destination = 'https://www.adobe.com/creativecloud/start-with-free-creativecloud.html';
      await page.route(destination, (route) => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Mock trial destination</title>',
      }));
      await page.route(service, (route) => route.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } }));
      if (mode === 'modal') {
        await open(page);
      } else {
        await page.goto(`${fixture}?inline`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      }
      await page.getByRole('textbox', { name: 'College email address' }).fill('student@school.example.org');
      await page.getByRole('button', { name: 'Check eligibility' }).click();
      const cta = page.getByRole('link', { name: 'Explore plans' });
      await expect(cta).toHaveAttribute('daa-ll', 'authored-trial');
      if (activation === 'click') await cta.click();
      else await cta.press('Enter');
      await expect(page).toHaveURL(destination);
      await expect.poll(() => beforeNavigation?.events.map(({ payload }) => payload.xdm.web.webInteraction.name))
        .toEqual(['ar_not_eligible', 'ar_399_click']);
      expect(beforeNavigation.clicks).toContainEqual({ label: 'authored-trial', defaultPrevented: false });
    });
  });
});

['form', 'rejected'].forEach((state) => {
  ['backdrop', 'X', 'Escape', 'programmatic'].forEach((method) => {
    test(`${state}: ${method} closes the owning modal once and preserves Milo close labels`, async ({ page }) => {
      await captureAnalytics(page);
      await page.route(service, (route) => route.fulfill({ json: { status: 'NOT_ELIGIBLE' }, headers: { 'access-control-allow-origin': '*' } }));
      await open(page);
      const getNames = async () => (await getAnalytics(page)).map(({ payload }) => payload.xdm.web.webInteraction.name);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('milo:modal:closed', { detail: { id: 'unrelated-modal' } })));
      expect(await getNames()).toEqual([]);
      if (state === 'rejected') {
        await page.getByRole('textbox', { name: 'College email address' }).fill('student@school.example.org');
        await page.getByRole('button', { name: 'Check eligibility' }).click();
        await expect(page.locator('.entitlement-check')).toHaveAttribute('data-state', 'rejected');
      }
      await expect(page.locator('.dialog-close')).toHaveAttribute('daa-ll', /:modalClose:buttonClose$/);
      await expect(page.locator('.modal-curtain')).toHaveAttribute('daa-ll', /:modalClose:curtainClose$/);
      const modalId = await page.getByRole('dialog').getAttribute('id');
      if (method === 'backdrop') await page.locator('.modal-curtain').click({ position: { x: 1, y: 1 } });
      else if (method === 'X') await page.getByRole('button', { name: 'Close', exact: true }).click();
      else if (method === 'Escape') await page.keyboard.press('Escape');
      else {
        await page.evaluate(async () => {
          const libs = '/libs';
          const { closeModal } = await import(`${libs}/blocks/modal/modal.js`);
          await closeModal(document.querySelector('.dialog-modal'));
        });
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const expected = state === 'rejected' ? ['ar_not_eligible', 'ar_modal_close'] : ['ar_modal_close'];
      await expect.poll(getNames).toEqual(expected);
      await page.evaluate((id) => window.dispatchEvent(new CustomEvent('milo:modal:closed', { detail: { id } })), modalId);
      expect(await getNames()).toEqual(expected);
      if (method !== 'programmatic') {
        const labels = await page.evaluate(() => window.entitlementClicks.map(({ label }) => label));
        const suffix = { backdrop: 'curtainClose', X: 'buttonClose', Escape: 'escapeClose' }[method];
        expect(labels.at(-1)).toMatch(new RegExp(`:modalClose:${suffix}$`));
      }
      if (state === 'form' && method === 'X') {
        await page.getByRole('link', { name: 'Check eligibility', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'College email address' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect.poll(getNames).toEqual(['ar_modal_close', 'ar_modal_close']);
      }
    });
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

['modal', 'inline'].forEach((mode) => {
  [
    { status: 'HAS_ACCESS', env: 'stage' },
    { status: 'ELIGIBLE', env: 'stage' },
    { status: 'ELIGIBLE', env: 'prod' },
  ].forEach(({ status, env }) => {
    test(`${mode}: ${status} immediately redirects in ${env} without success content or a timer`, async ({ page }) => {
      await captureAnalytics(page);
      let endpoint;
      await page.route(service, (route) => {
        endpoint = route.request().url();
        return route.fulfill({ json: { status }, headers: { 'access-control-allow-origin': '*' } });
      });
      let beforeNavigation;
      await captureNavigation(page, (state) => { beforeNavigation = state; });
      if (mode === 'modal') {
        await open(page, `?env=${env}`);
      } else {
        await page.goto(`${fixture}?inline&env=${env}`);
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      }
      await freeze(page);
      await page.getByRole('textbox', { name: 'College email address' }).fill(' student@School.Example.ORG ');
      await expect(page.getByRole('checkbox')).not.toBeChecked();
      await page.getByRole('textbox', { name: 'College email address' }).press('Enter');
      const destination = env === 'prod'
        ? 'https://www.adobe.com/home/a/school.example.org?pa_code=PA-2300'
        : stageDestination;
      await expect(page).toHaveURL(destination);
      expect(endpoint).toBe(`https://edu-org${env === 'prod' ? '' : '-stage'}.adobe.io/v1/entitlements`);
      await expect.poll(() => beforeNavigation).toMatchObject({ destination, state: 'form', result: false, cta: false });
      expect(beforeNavigation.events.map(({ payload }) => payload.xdm.web.webInteraction.name)).toEqual(['ar_eligible']);
    });
  });
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
  test(`${name}: shared submission indicator preserves CTA layout and accessibility`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: motion });
    let pendingRoute;
    await page.route(service, (route) => { pendingRoute = route; });
    await open(page);
    const input = page.getByRole('textbox', { name: 'College email address' });
    const submit = page.locator('.entitlement-check-submit');
    const progress = submit.locator('sp-progress-circle');
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
    const indicator = await relativeBox(page, 'sp-progress-circle');
    const button = await relativeBox(page, '.entitlement-check-submit');
    expect(indicator.width).toBe(20);
    expect(indicator.height).toBe(20);
    expect(indicator.x + indicator.width / 2).toBeCloseTo(button.x + button.width / 2, 1);
    expect(indicator.y + indicator.height / 2).toBeCloseTo(button.y + button.height / 2, 1);
    await expect(progress.locator('.fill').first()).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
    const animations = await progress.locator('.fills, .fillSubMask1, .fillSubMask2')
      .evaluateAll((elements) => elements.map((element) => {
        const style = getComputedStyle(element);
        return { name: style.animationName, duration: parseFloat(style.animationDuration) };
      }));
    expect(animations).toHaveLength(3);
    animations.forEach((animation) => {
      expect(animation.name).toMatch(/^spectrum-/);
      if (motion === 'reduce') expect(animation.duration).toBe(0);
      else expect(animation.duration).toBeGreaterThan(0);
    });
    await checkAccessibility(page);
    if (forcedColors) {
      await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
      await expect(progress.locator('.fill').first()).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect(progress.locator('.track')).toHaveCSS('border-top-style', 'double');
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
