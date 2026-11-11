import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../edu/blocks/entitlement-check/entitlement-check.js';

const mockLibs = '/test/blocks/entitlement-check/mocks';
const { setConfig } = await import(`${mockLibs}/utils/utils.js`);
const { analyticsEvents } = await import(`${mockLibs}/martech/helpers.js`);
const fixture = await fetch('/test/blocks/entitlement-check/fragment.plain.html').then((response) => response.text());
const personalEmailError = 'Make sure to use your school email, not your personal email.';

describe('Entitlement check', () => {
  let modal;
  let block;
  let clock;
  let request;
  let originalLana;

  async function mount(attached = true, markup = fixture, inModal = true) {
    modal = document.createElement('div');
    modal.className = inModal ? 'dialog-modal' : 'entitlement-test-page';
    modal.id = 'entitlement-test';
    modal.innerHTML = markup;
    block = modal.querySelector('.entitlement-check');
    if (attached) document.body.append(modal);
    await init(block);
  }

  function close(id = modal.id) {
    window.dispatchEvent(new CustomEvent('milo:modal:closed', { detail: { id } }));
  }

  async function submit(email = 'student@school.example.org', checked = true) {
    block.querySelector('input').value = email;
    block.querySelector('[type="checkbox"]').checked = checked;
    block.querySelector('form').requestSubmit();
    await clock.tickAsync(0);
  }

  beforeEach(async () => {
    analyticsEvents.length = 0;
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    request = sinon.stub(window, 'fetch').resolves({ ok: true, json: async () => ({ status: 'ELIGIBLE', reason: 'JIT_ACCOUNT_CREATION_ON' }) });
    originalLana = window.lana;
    window.lana = { log: sinon.spy() };
    setConfig({ env: { name: 'stage' } });
    await mount();
  });

  afterEach(() => {
    close();
    window.dispatchEvent(new Event('pagehide'));
    modal.remove();
    clock.restore();
    sinon.restore();
    window.lana = originalLana;
  });

  it('tracks only the first nonempty textbox input without including its contents', async () => {
    const input = block.querySelector('input');
    expect(analyticsEvents).to.deep.equal([]);
    ['', ' ', 's', 'student@school.example.org', '', 'another@college.example.org'].forEach((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    });
    await clock.tickAsync(0);
    expect(analyticsEvents).to.deep.equal(['entitlement-check:email-input']);
  });

  it('tracks checkbox checks but not unchecks', async () => {
    const consent = block.querySelector('[type="checkbox"]');
    consent.click();
    consent.click();
    consent.click();
    await clock.tickAsync(0);
    expect(analyticsEvents).to.deep.equal([
      'entitlement-check:checkbox-checked',
      'entitlement-check:checkbox-checked',
    ]);
  });

  it('preserves event order while analytics loads without delaying eligibility', async () => {
    const form = block.querySelector('form');
    form.requestSubmit();
    const input = block.querySelector('input');
    input.value = 'student@school.example.org';
    input.dispatchEvent(new Event('input'));
    block.querySelector('[type="checkbox"]').click();
    form.requestSubmit();
    expect(request.calledOnce).to.equal(true);
    await clock.tickAsync(0);
    expect(analyticsEvents).to.deep.equal([
      'entitlement-check:validation-error:required',
      'entitlement-check:email-input',
      'entitlement-check:checkbox-checked',
      'entitlement-check:form-submit',
      'entitlement-check:eligible',
    ]);
  });

  it('tracks only the displayed validation error without a submission or API outcome', async () => {
    await submit('', false);
    await submit('not-an-email', false);
    await submit('student@gmail.com', false);
    expect(analyticsEvents).to.deep.equal([
      'entitlement-check:validation-error:required',
      'entitlement-check:validation-error:invalid-email',
      'entitlement-check:validation-error:personal-email',
    ]);
    expect(request.called).to.equal(false);
  });

  ['HAS_ACCESS', 'ELIGIBLE', 'NOT_ELIGIBLE'].forEach((status) => {
    it(`tracks a single valid submission and the normalized ${status} return`, async () => {
      let resolve;
      request.returns(new Promise((done) => { resolve = done; }));
      await submit();
      await submit();
      expect(request.callCount).to.equal(1);
      expect(analyticsEvents).to.deep.equal(['entitlement-check:form-submit']);
      resolve({ ok: true, json: async () => ({ status }) });
      await clock.tickAsync(0);
      expect(analyticsEvents).to.deep.equal([
        'entitlement-check:form-submit',
        `entitlement-check:${status === 'NOT_ELIGIBLE' ? 'ineligible' : 'eligible'}`,
      ]);
    });
  });

  it('tracks a retry as another submission without treating a service failure as ineligibility', async () => {
    request.onFirstCall().resolves({ ok: false });
    await submit();
    expect(analyticsEvents).to.deep.equal(['entitlement-check:form-submit']);
    await submit();
    expect(analyticsEvents).to.deep.equal([
      'entitlement-check:form-submit',
      'entitlement-check:form-submit',
      'entitlement-check:eligible',
    ]);
  });

  it('keeps eligibility functional and logs no private details if analytics fails', async () => {
    sinon.stub(analyticsEvents, 'push').throws(new Error('Analytics failure for student@school.example.org'));
    await submit();
    expect(request.calledOnce).to.equal(true);
    expect(block.dataset.state).to.equal('success');
    expect(window.lana.log.callCount).to.equal(2);
    expect(window.lana.log.args.every(([message]) => message === 'Entitlement check: analytics event failed')).to.equal(true);
    expect(JSON.stringify(window.lana.log.args)).not.to.include('student@school.example.org');
  });

  it('preserves authored headings, legal links, and accessible field associations', () => {
    const input = block.querySelector('input');
    expect(block.querySelector('h2').textContent).to.include('Creative Cloud Pro');
    expect(block.querySelector('label').htmlFor).to.equal(input.id);
    expect(document.getElementById(input.getAttribute('aria-describedby')).hidden).to.equal(true);
    expect(block.querySelector('.entitlement-check-legal a').href).to.equal('https://www.adobe.com/privacy/policy.html');
    expect(block.querySelector('button').textContent).to.equal('Check eligibility');
    const consent = block.querySelector('[type="checkbox"]');
    expect(consent.checked).to.equal(false);
    expect(consent.required).to.equal(false);
    expect(consent.hasAttribute('aria-describedby')).to.equal(false);
    expect(block.querySelector('.entitlement-check-legal').htmlFor).to.equal(consent.id);
  });

  [
    { email: '', message: 'This field is required.' },
    { email: 'not-an-email', message: 'Enter a valid email address.' },
    { email: 'student@gmail.com', message: personalEmailError },
  ].forEach(({ email, message }) => {
    it(`validates the email for ${JSON.stringify(email)} when consent is unchecked`, async () => {
      await submit(email, false);
      const consent = block.querySelector('[type="checkbox"]');
      const error = block.querySelector('[role="alert"]');
      expect(error.textContent).to.equal(message);
      expect(block.querySelectorAll('[role="alert"]:not([hidden])').length).to.equal(1);
      expect(block.querySelector('input').getAttribute('aria-invalid')).to.equal('true');
      expect(consent.hasAttribute('aria-invalid')).to.equal(false);
      consent.click();
      expect(error.hidden).to.equal(false);
      expect(request.called).to.equal(false);
    });
  });

  it('submits a valid email without consent or checkbox validation analytics', async () => {
    const consent = block.querySelector('[type="checkbox"]');
    const error = block.querySelector('[role="alert"]');
    await submit('student@school.example.org', false);
    expect(error.hidden).to.equal(true);
    expect(consent.checked).to.equal(false);
    expect(consent.hasAttribute('aria-invalid')).to.equal(false);
    expect(request.calledOnce).to.equal(true);
    expect(block.dataset.state).to.equal('success');
    expect(analyticsEvents).to.deep.equal([
      'entitlement-check:form-submit',
      'entitlement-check:eligible',
    ]);
  });

  ['Obsolete checkbox message', ' '].forEach((message) => {
    it(`ignores an obsolete checkbox-error authoring row containing ${JSON.stringify(message)}`, async () => {
      close();
      modal.remove();
      await mount(true, fixture.replace(
        '<div class="entitlement-check">',
        `<div class="entitlement-check"><div><div>checkbox-error</div><div>${message}</div></div>`,
      ));
      await submit('student@school.example.org', false);
      expect(block.dataset.state).to.equal('success');
      expect(request.calledOnce).to.equal(true);
      expect(window.lana.log.called).to.equal(false);
    });
  });

  it('initializes within a detached Milo dialog before it is opened', async () => {
    close();
    modal.remove();
    await mount(false);
    document.body.append(modal);
    await submit();
    expect(block.dataset.state).to.equal('success');
  });

  ['', 'not-an-email', 'student@'].forEach((email) => {
    it(`validates ${JSON.stringify(email)} on submit without an API request`, async () => {
      await submit(email);
      expect(request.called).to.equal(false);
      const input = block.querySelector('input');
      expect(input.getAttribute('aria-invalid')).to.equal('true');
      expect(document.activeElement).to.equal(input);
      expect(block.querySelector('[role="alert"]').textContent).to.equal(
        email ? 'Enter a valid email address.' : 'This field is required.',
      );
      expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
      input.value = 'student@school.example.org';
      input.dispatchEvent(new Event('input'));
      expect(input.hasAttribute('aria-invalid')).to.equal(false);
      expect(block.querySelector('[role="alert"]').hidden).to.equal(true);
    });
  });

  it('blocks every listed personal domain, including mixed case, tags, and surrounding whitespace', () => {
    const domains = [
      'gmail.com', 'googlemail.com',
      'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com',
      'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com', 'live.in', 'msn.com',
      'rediffmail.com', 'rediff.com',
      'icloud.com', 'me.com', 'mac.com',
      'zoho.com', 'zohomail.in', 'zohomail.com',
      'protonmail.com', 'proton.me',
      'aol.com', 'mail.com', 'gmx.com', 'yandex.com', 'indiatimes.com', 'sify.com', 'tutanota.com',
    ];
    const input = block.querySelector('input');
    const form = block.querySelector('form');
    domains.forEach((domain) => {
      input.value = ` student+tag@${domain.toUpperCase()} `;
      form.requestSubmit();
      expect(request.called, domain).to.equal(false);
      expect(block.querySelector('[role="alert"]').textContent, domain).to.equal(personalEmailError);
    });
    expect(input.getAttribute('aria-invalid')).to.equal('true');
    expect(document.activeElement).to.equal(input);
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('button').disabled).to.equal(false);
    expect(block.querySelector('[type="checkbox"]').disabled).to.equal(false);
    expect(block.querySelector('[type="checkbox"]').checked).to.equal(false);
    expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
    expect(clock.countTimers()).to.equal(0);
  });

  ['gmail.com.school.example.org', 'notgmail.com', 'students.gmail.com'].forEach((domain) => {
    it(`allows the unlisted domain ${domain} rather than matching a substring`, async () => {
      await submit(`student@${domain}`);
      expect(request.calledOnce).to.equal(true);
      expect(block.dataset.state).to.equal('success');
    });
  });

  it('uses the authored personal-email message and allows correction and resubmission', async () => {
    close();
    modal.remove();
    const message = 'Please enter your institution email address.';
    await mount(true, fixture.replace(personalEmailError, message));
    await submit('student@gmail.com');
    expect(block.querySelector('[role="alert"]').textContent).to.equal(message);
    expect(request.called).to.equal(false);
    const input = block.querySelector('input');
    input.value = 'student@school.example.org';
    input.dispatchEvent(new Event('input'));
    expect(block.querySelector('[role="alert"]').hidden).to.equal(true);
    expect(input.hasAttribute('aria-invalid')).to.equal(false);
    await submit();
    expect(request.calledOnce).to.equal(true);
    expect(block.dataset.state).to.equal('success');
  });

  it('keeps existing fragments usable with the requested default when the optional message row is absent', async () => {
    close();
    modal.remove();
    await mount(true, fixture.replace(
      `<div><div>personal-email-error</div><div>${personalEmailError}</div></div>`,
      '',
    ));
    await submit('student@gmail.com');
    expect(block.querySelector('[role="alert"]').textContent).to.equal(personalEmailError);
    expect(request.called).to.equal(false);
    expect(window.lana.log.called).to.equal(false);
  });

  it('reports an empty authored personal-email message as invalid configuration', async () => {
    close();
    modal.innerHTML = fixture.replace(personalEmailError, ' ');
    block = modal.querySelector('.entitlement-check');
    await init(block).then(
      () => { throw new Error('Expected invalid authoring to fail.'); },
      (error) => expect(error.message).to.include('authoring configuration'),
    );
    expect(window.lana.log.calledOnce).to.equal(true);
    expect(request.called).to.equal(false);
  });

  ['stage', 'local', 'page', 'live', 'prod'].forEach((env) => {
    it(`uses the ${env === 'prod' ? 'production' : 'staging'} endpoint in ${env}`, async () => {
      close();
      modal.remove();
      setConfig({ env: { name: env } });
      await mount();
      await submit(' student@school.example.org ');
      const [url, options] = request.firstCall.args;
      expect(url).to.equal(`https://edu-org${env === 'prod' ? '' : '-stage'}.adobe.io/v1/entitlements`);
      expect(options.method).to.equal('POST');
      expect(options.headers).to.deep.equal({ 'Content-Type': 'application/json', 'x-api-key': 'acom-education' });
      expect(JSON.parse(options.body)).to.deep.equal({ email: 'student@school.example.org', offerId: '92645C312E8ADE0DB7071A82AD389C8E' });
      expect(options.signal.aborted).to.equal(false);
      expect(block.dataset.state).to.equal('success');
    });
  });

  ['HAS_ACCESS', 'ELIGIBLE'].forEach((status) => {
    it(`shows persistent authored success for ${status} with a computed, normalized CTA`, async () => {
      request.resolves({ ok: true, json: async () => ({ status }) });
      await submit(' student@School.Example.ORG ');
      expect(block.dataset.state).to.equal('success');
      expect(block.querySelector('form')).to.equal(null);
      expect(block.querySelector('.entitlement-check-heading').textContent).to.include('Congratulations!');
      const link = block.querySelector('.entitlement-check-continue');
      expect(link.textContent).to.equal('Continue to Adobe');
      expect(link.classList.contains('con-button')).to.equal(true);
      expect(link.hasAttribute('target')).to.equal(false);
      expect(link.href).to.equal('https://adobe.com/apps/a/school.example.org');
      expect(document.activeElement).to.equal(block.querySelector('h2'));
      expect(modal.getAttribute('aria-label')).to.include('Congratulations!');
      expect(clock.countTimers()).to.equal(0);
      await clock.tickAsync(60000);
      expect(block.isConnected).to.equal(true);
      expect(block.dataset.state).to.equal('success');
      expect(clock.countTimers()).to.equal(0);
    });
  });

  it('preserves rich heading markup when separating the mobile lead sentence', async () => {
    close();
    modal.remove();
    await mount(true, fixture.replace(
      'Congratulations! You have free access.',
      '<em>Congratulations!</em> You have <strong>free access.</strong>',
    ));
    await submit();
    const title = block.querySelector('.entitlement-check-heading');
    expect(title.textContent).to.equal('Congratulations! You have free access.');
    expect(title.querySelector('.entitlement-check-heading-lead em').textContent).to.equal('Congratulations!');
    expect(title.querySelector('strong').textContent).to.equal('free access.');
  });

  it('retains a single-sentence heading and a custom authored CTA label', async () => {
    close();
    modal.remove();
    await mount(true, fixture
      .replace('Congratulations! You have free access.', 'Your access is ready.')
      .replace('Continue to Adobe', 'Continue to your apps'));
    await submit();
    expect(block.querySelector('.entitlement-check-heading').textContent).to.equal('Your access is ready.');
    expect(block.querySelector('.entitlement-check-heading-lead')).to.equal(null);
    const link = block.querySelector('.entitlement-check-continue');
    expect(link.textContent).to.equal('Continue to your apps');
    expect(link.href).to.equal('https://adobe.com/apps/a/school.example.org');
  });

  it('uses authored link text as a single CTA with the computed same-tab destination', async () => {
    close();
    modal.remove();
    await mount(true, fixture.replace(
      'Continue to Adobe',
      '<a href="https://example.com" target="_blank"><em>Continue to Adobe</em></a>',
    ));
    await submit();
    const link = block.querySelector('.entitlement-check-continue');
    expect(link.textContent).to.equal('Continue to Adobe');
    expect(link.querySelector('a')).to.equal(null);
    expect(link.href).to.equal('https://adobe.com/apps/a/school.example.org');
    expect(link.hasAttribute('target')).to.equal(false);
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    expect(clock.countTimers()).to.equal(0);
  });

  it('ignores an obsolete authored redirect notice in existing fragments', async () => {
    close();
    modal.remove();
    await mount(true, fixture.replace(
      '<div class="entitlement-check">',
      '<div class="entitlement-check"><div><div>success-redirect-notice</div><div>Obsolete redirect message</div></div>',
    ));
    await submit();
    expect(block.dataset.state).to.equal('success');
    expect(block.textContent).not.to.include('Obsolete redirect message');
    expect(clock.countTimers()).to.equal(0);
  });

  it('shows the authored rejected CTA without a redirect for another business status', async () => {
    request.resolves({ ok: true, json: async () => ({ status: 'NOT_ELIGIBLE' }) });
    await submit();
    expect(block.dataset.state).to.equal('rejected');
    const link = block.querySelector('.entitlement-check-trial');
    expect(link.textContent).to.equal('Get my free trial');
    expect(link.href).to.equal('https://www.adobe.com/creativecloud/start-with-free-creativecloud.html');
    expect(clock.countTimers()).to.equal(0);
    expect(block.querySelector('input')).to.equal(null);
  });

  [
    { name: 'HTTP failure', value: { ok: false } },
    { name: 'invalid JSON', value: { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } } },
    ...[null, {}, { status: 12 }, { status: '' }, { status: ' ' }].map((data) => ({ name: `invalid response ${JSON.stringify(data)}`, value: { ok: true, json: async () => data } })),
  ].forEach(({ name, value }) => {
    it(`retains the form and supports retry after ${name}`, async () => {
      request.onFirstCall().resolves(value);
      await submit();
      expect(block.dataset.state).to.equal('form');
      expect(block.querySelector('input').value).to.equal('student@school.example.org');
      expect(block.querySelector('input').hasAttribute('aria-invalid')).to.equal(false);
      expect(block.querySelector('[role="alert"]').textContent).to.include('Please try again.');
      expect(block.querySelector('button').disabled).to.equal(false);
      expect(block.querySelector('[type="checkbox"]').disabled).to.equal(false);
      expect(block.querySelector('[type="checkbox"]').checked).to.equal(true);
      expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
      expect(block.querySelector('form').hasAttribute('aria-busy')).to.equal(false);
      expect(window.lana.log.calledOnceWithExactly(
        'Entitlement check: eligibility request failed',
        { tags: 'entitlement-check', severity: 'error' },
      )).to.equal(true);
      await submit();
      expect(request.callCount).to.equal(2);
      expect(block.dataset.state).to.equal('success');
    });
  });

  it('handles network failure without logging the visitor email or service error', async () => {
    request.rejects(new TypeError('Network failure with student@school.example.org'));
    await submit();
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('[role="alert"]').hidden).to.equal(false);
    expect(window.lana.log.calledOnceWithExactly(
      'Entitlement check: eligibility request failed',
      { tags: 'entitlement-check', severity: 'error' },
    )).to.equal(true);
    expect(JSON.stringify(window.lana.log.args)).not.to.include('student@school.example.org');
    expect(JSON.stringify(window.lana.log.args)).not.to.include('Network failure');
    expect(clock.countTimers()).to.equal(0);
  });

  it('recovers from result construction failure without logging private error details', async () => {
    const render = sinon.stub(document, 'createRange').throws(
      new Error('Private response for student@school.example.org'),
    );
    await submit();
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('input').value).to.equal('student@school.example.org');
    expect(block.querySelector('[role="alert"]').textContent).to.include('Please try again.');
    expect(block.querySelector('button').disabled).to.equal(false);
    expect(modal.hasAttribute('aria-label')).to.equal(false);
    expect(clock.countTimers()).to.equal(0);
    expect(window.lana.log.calledOnce).to.equal(true);
    expect(window.lana.log.firstCall.args).to.deep.equal([
      'Entitlement check: result rendering failed',
      { tags: 'entitlement-check', severity: 'error' },
    ]);
    render.restore();
    await submit();
    expect(request.callCount).to.equal(2);
    expect(block.dataset.state).to.equal('success');
  });

  ['ELIGIBLE', 'NOT_ELIGIBLE'].forEach((status) => {
    it(`restores the form and modal label after partially displaying ${status}`, async () => {
      request.resolves({ ok: true, json: async () => ({ status }) });
      modal.setAttribute('aria-label', 'Check eligibility');
      const originalFocus = HTMLElement.prototype.focus;
      const render = sinon.stub(HTMLElement.prototype, 'focus').callsFake(function focusResult() {
        if (this.matches('.entitlement-check-result .entitlement-check-heading')) {
          throw new Error('Result focus failed');
        }
        originalFocus.call(this);
      });
      await submit();
      const input = block.querySelector('input');
      expect(block.dataset.state).to.equal('form');
      expect(block.querySelector('.entitlement-check-result')).to.equal(null);
      expect(input.value).to.equal('student@school.example.org');
      expect(input.readOnly).to.equal(false);
      expect(document.activeElement).to.equal(input);
      expect(block.querySelector('[role="alert"]').textContent).to.include('Please try again.');
      expect(block.querySelector('button').disabled).to.equal(false);
      expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
      expect(block.querySelector('form').hasAttribute('aria-busy')).to.equal(false);
      expect(block.querySelector('[role="status"]')).to.equal(null);
      expect(modal.getAttribute('aria-label')).to.equal('Check eligibility');
      expect(window.lana.log.firstCall.args[0]).to.equal('Entitlement check: result rendering failed');
      expect(clock.countTimers()).to.equal(0);
      await clock.tickAsync(2000);
      expect(block.dataset.state).to.equal('form');
      render.restore();
      await submit();
      expect(request.callCount).to.equal(2);
      expect(block.dataset.state).to.equal(status === 'ELIGIBLE' ? 'success' : 'rejected');
    });
  });

  it('shows only a loading indicator and prevents duplicate requests without a status message', async () => {
    let resolve;
    request.returns(new Promise((done) => { resolve = done; }));
    const progress = block.querySelector('.spectrum-ProgressCircle');
    expect(progress.hidden).to.equal(true);
    await submit();
    const form = block.querySelector('form');
    expect(form.getAttribute('aria-busy')).to.equal('true');
    expect(block.querySelector('input').readOnly).to.equal(true);
    expect(block.querySelector('[type="checkbox"]').disabled).to.equal(true);
    expect(block.querySelector('button').disabled).to.equal(true);
    expect(block.querySelector('button').getAttribute('aria-label')).to.equal('Check eligibility');
    expect(progress.hidden).to.equal(false);
    expect(progress.getAttribute('aria-hidden')).to.equal('true');
    expect(block.querySelector('[role="status"]')).to.equal(null);
    form.requestSubmit();
    expect(request.callCount).to.equal(1);
    expect(block.querySelectorAll('.spectrum-ProgressCircle').length).to.equal(1);
    resolve({ ok: true, json: async () => ({ status: 'ELIGIBLE' }) });
    await clock.tickAsync(0);
    expect(progress.hidden).to.equal(true);
    expect(block.dataset.state).to.equal('success');
  });

  it('preserves the authored CTA name while pending and after failure', async () => {
    close();
    modal.remove();
    const label = 'Verify college access';
    await mount(true, fixture.replace(
      '<div><div>submit-label</div><div>Check eligibility</div></div>',
      `<div><div>submit-label</div><div>${label}</div></div>`,
    ));
    let resolve;
    request.returns(new Promise((done) => { resolve = done; }));
    await submit();
    const button = block.querySelector('button');
    expect(button.textContent).to.equal(label);
    expect(button.getAttribute('aria-label')).to.equal(label);
    expect(button.firstElementChild.hidden).to.equal(false);
    resolve({ ok: false });
    await clock.tickAsync(0);
    expect(button.textContent).to.equal(label);
    expect(button.getAttribute('aria-label')).to.equal(label);
    expect(button.disabled).to.equal(false);
    expect(button.firstElementChild.hidden).to.equal(true);
  });

  it('times out a pending request and allows retry', async () => {
    request.onFirstCall().callsFake((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await submit();
    await clock.tickAsync(15000);
    expect(request.firstCall.args[1].signal.aborted).to.equal(true);
    expect(block.querySelector('[role="alert"]').textContent).to.include('Please try again.');
    expect(block.querySelector('button').disabled).to.equal(false);
    expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
    expect(window.lana.log.calledOnceWithExactly(
      'Entitlement check: eligibility request failed',
      { tags: 'entitlement-check', severity: 'error' },
    )).to.equal(true);
    await submit();
    expect(block.dataset.state).to.equal('success');
  });

  it('cancels the request and ignores late responses after the owning modal closes', async () => {
    let resolve;
    request.returns(new Promise((done) => { resolve = done; }));
    await submit();
    close('another-modal');
    expect(request.firstCall.args[1].signal.aborted).to.equal(false);
    close();
    expect(request.firstCall.args[1].signal.aborted).to.equal(true);
    expect(clock.countTimers()).to.equal(0);
    resolve({ ok: true, json: async () => ({ status: 'ELIGIBLE' }) });
    await clock.tickAsync(0);
    expect(block.dataset.state).to.equal('form');
    expect(clock.countTimers()).to.equal(0);
    expect(window.lana.log.called).to.equal(false);
    block.querySelector('input').dispatchEvent(new Event('input'));
    const consent = block.querySelector('[type="checkbox"]');
    consent.dispatchEvent(new Event('change'));
    await clock.tickAsync(0);
    expect(analyticsEvents).to.deep.equal(['entitlement-check:form-submit']);
  });

  it('cleans up on page exit and creates a fresh form on reopen', async () => {
    await submit();
    window.dispatchEvent(new Event('pagehide'));
    expect(clock.countTimers()).to.equal(0);
    modal.remove();
    await mount();
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('input').value).to.equal('');
    expect(block.querySelector('[type="checkbox"]').checked).to.equal(false);
    await submit();
    expect(block.dataset.state).to.equal('success');
  });

  it('keeps the form usable after a back-forward-cache page transition', async () => {
    request.onFirstCall().callsFake((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await submit();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    await clock.tickAsync(0);
    expect(request.firstCall.args[1].signal.aborted).to.equal(true);
    expect(block.querySelector('button').disabled).to.equal(false);
    expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
    await submit();
    expect(block.dataset.state).to.equal('success');
  });

  it('reports invalid authoring rather than inventing a trial destination', async () => {
    close();
    modal.innerHTML = fixture;
    block = modal.querySelector('.entitlement-check');
    block.lastElementChild.remove();
    await init(block).then(
      () => { throw new Error('Expected invalid authoring to fail.'); },
      (error) => expect(error.message).to.include('authoring configuration'),
    );
    expect(window.lana.log.calledOnce).to.equal(true);
    expect(request.called).to.equal(false);
  });

  it('validates email, submits without consent, and retries directly on the page', async () => {
    close();
    modal.remove();
    await mount(true, fixture, false);
    expect(modal.classList.contains('entitlement-check-modal')).to.equal(false);
    await submit('', false);
    expect(block.querySelector('[role="alert"]').textContent).to.equal('This field is required.');
    expect(request.called).to.equal(false);
    request.onFirstCall().resolves({ ok: false });
    await submit('student@school.example.org', false);
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('[role="alert"]').textContent).to.include('Please try again.');
    expect(block.querySelector('button').disabled).to.equal(false);
    expect(block.querySelector('[type="checkbox"]').checked).to.equal(false);
    request.resolves({ ok: true, json: async () => ({ status: 'NOT_ELIGIBLE' }) });
    await submit('student@school.example.org', false);
    expect(block.dataset.state).to.equal('rejected');
    expect(document.activeElement).to.equal(block.querySelector('h2'));
    expect(modal.hasAttribute('aria-label')).to.equal(false);
    expect(block.querySelector('.entitlement-check-trial').textContent).to.equal('Get my free trial');
  });

  it('keeps the inline success CTA available without automatic navigation after unrelated modal closure', async () => {
    close();
    modal.remove();
    await mount(true, fixture, false);
    await submit('student@School.Example.ORG');
    expect(block.dataset.state).to.equal('success');
    expect(block.querySelector('.entitlement-check-continue').href).to.equal('https://adobe.com/apps/a/school.example.org');
    expect(document.activeElement).to.equal(block.querySelector('h2'));
    close('another-modal');
    await clock.tickAsync(60000);
    expect(block.dataset.state).to.equal('success');
    expect(clock.countTimers()).to.equal(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(clock.countTimers()).to.equal(0);
  });

  it('ignores modal closure inline but aborts its pending request on page exit', async () => {
    close();
    modal.remove();
    await mount(true, fixture, false);
    let resolve;
    request.returns(new Promise((done) => { resolve = done; }));
    await submit();
    close();
    expect(request.firstCall.args[1].signal.aborted).to.equal(false);
    window.dispatchEvent(new Event('pagehide'));
    expect(request.firstCall.args[1].signal.aborted).to.equal(true);
    resolve({ ok: true, json: async () => ({ status: 'ELIGIBLE' }) });
    await clock.tickAsync(0);
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('.spectrum-ProgressCircle').hidden).to.equal(true);
    expect(clock.countTimers()).to.equal(0);
    expect(window.lana.log.called).to.equal(false);
  });

  ['ELIGIBLE', 'NOT_ELIGIBLE'].forEach((status) => {
    it(`recovers from ${status} result focus failure outside a modal`, async () => {
      close();
      modal.remove();
      await mount(true, fixture, false);
      request.resolves({ ok: true, json: async () => ({ status }) });
      const originalFocus = HTMLElement.prototype.focus;
      const render = sinon.stub(HTMLElement.prototype, 'focus').callsFake(function focusResult() {
        if (this.matches('.entitlement-check-result .entitlement-check-heading')) throw new Error('Result focus failed');
        originalFocus.call(this);
      });
      await submit();
      expect(block.dataset.state).to.equal('form');
      expect(block.querySelector('[role="alert"]').textContent).to.include('Please try again.');
      expect(document.activeElement).to.equal(block.querySelector('input'));
      expect(modal.hasAttribute('aria-label')).to.equal(false);
      expect(clock.countTimers()).to.equal(0);
      expect(window.lana.log.firstCall.args[0]).to.equal('Entitlement check: result rendering failed');
      render.restore();
      await submit();
      expect(block.dataset.state).to.equal(status === 'ELIGIBLE' ? 'success' : 'rejected');
    });
  });
});
