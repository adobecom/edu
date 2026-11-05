import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../edu/blocks/entitlement-check/entitlement-check.js';

const mockLibs = '/test/blocks/entitlement-check/mocks';
const { setConfig } = await import(`${mockLibs}/utils/utils.js`);
const fixture = await fetch('/test/blocks/entitlement-check/fragment.plain.html').then((response) => response.text());

describe('Entitlement check', () => {
  let modal;
  let block;
  let clock;
  let request;
  let originalLana;

  async function mount(attached = true, markup = fixture) {
    modal = document.createElement('div');
    modal.className = 'dialog-modal';
    modal.id = 'entitlement-test';
    modal.innerHTML = markup;
    block = modal.querySelector('.entitlement-check');
    if (attached) document.body.append(modal);
    await init(block);
  }

  function close(id = modal.id) {
    window.dispatchEvent(new CustomEvent('milo:modal:closed', { detail: { id } }));
  }

  async function submit(email = 'student@school.example.org') {
    block.querySelector('input').value = email;
    block.querySelector('form').requestSubmit();
    await clock.tickAsync(0);
  }

  beforeEach(async () => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    request = sinon.stub(window, 'fetch').resolves({ ok: true, json: async () => ({ status: 'ELIGIBLE', reason: 'JIT_ACCOUNT_CREATION_ON' }) });
    originalLana = window.lana;
    window.lana = { log: sinon.spy() };
    setConfig({ env: { name: 'stage' } });
    await mount();
  });

  afterEach(() => {
    close();
    modal.remove();
    clock.restore();
    sinon.restore();
    window.lana = originalLana;
  });

  it('preserves authored headings, legal links, and accessible field associations', () => {
    const input = block.querySelector('input');
    expect(block.querySelector('h2').textContent).to.include('Creative Cloud Pro');
    expect(block.querySelector('label').htmlFor).to.equal(input.id);
    expect(document.getElementById(input.getAttribute('aria-describedby')).hidden).to.equal(true);
    expect(block.querySelector('.entitlement-check-legal a').href).to.equal('https://www.adobe.com/privacy/policy.html');
    expect(block.querySelector('button').textContent).to.equal('Check eligibility');
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
      input.value = 'student@gmail.com';
      input.dispatchEvent(new Event('input'));
      expect(input.hasAttribute('aria-invalid')).to.equal(false);
      expect(block.querySelector('[role="alert"]').hidden).to.equal(true);
    });
  });

  ['stage', 'local', 'page', 'live', 'prod'].forEach((env) => {
    it(`uses the ${env === 'prod' ? 'production' : 'staging'} endpoint in ${env}`, async () => {
      close();
      modal.remove();
      setConfig({ env: { name: env } });
      await mount();
      await submit(' student@gmail.com ');
      const [url, options] = request.firstCall.args;
      expect(url).to.equal(`https://edu-org${env === 'prod' ? '' : '-stage'}.adobe.io/v1/entitlements`);
      expect(options.method).to.equal('POST');
      expect(options.headers).to.deep.equal({ 'Content-Type': 'application/json', 'x-api-key': 'acom-education' });
      expect(JSON.parse(options.body)).to.deep.equal({ email: 'student@gmail.com', offerId: '92645C312E8ADE0DB7071A82AD389C8E' });
      expect(options.signal.aborted).to.equal(false);
      expect(block.dataset.state).to.equal('success');
    });
  });

  ['HAS_ACCESS', 'ELIGIBLE'].forEach((status) => {
    it(`shows authored success for ${status} with a computed, normalized domain link`, async () => {
      request.resolves({ ok: true, json: async () => ({ status }) });
      await submit(' student@School.Example.ORG ');
      expect(block.dataset.state).to.equal('success');
      expect(block.querySelector('form')).to.equal(null);
      expect(block.querySelector('.entitlement-check-heading').textContent).to.include('Congratulations!');
      const link = block.querySelector('.entitlement-check-continue a');
      expect(link.textContent).to.equal('Adobe.com.');
      expect(link.parentElement.textContent).to.equal('Not redirected? Continue to Adobe.com.');
      expect(link.getAttribute('aria-label')).to.equal('Not redirected? Continue to Adobe.com.');
      expect(link.href).to.equal('https://adobe.com/apps/a/school.example.org');
      expect(document.activeElement).to.equal(block.querySelector('h2'));
      expect(modal.getAttribute('aria-label')).to.include('Congratulations!');
      expect(clock.countTimers()).to.equal(1);
      await clock.tickAsync(9999);
      expect(block.isConnected).to.equal(true);
      expect(clock.countTimers()).to.equal(1);
      close();
      expect(clock.countTimers()).to.equal(0);
      await clock.tickAsync(1);
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

  it('retains a single-sentence heading and a continuation label without the destination hostname', async () => {
    close();
    modal.remove();
    await mount(true, fixture
      .replace('Congratulations! You have free access.', 'Your access is ready.')
      .replace('Not redirected? Continue to Adobe.com.', 'Continue to your apps'));
    await submit();
    expect(block.querySelector('.entitlement-check-heading').textContent).to.equal('Your access is ready.');
    expect(block.querySelector('.entitlement-check-heading-lead')).to.equal(null);
    const link = block.querySelector('.entitlement-check-continue a');
    expect(link.textContent).to.equal('Continue to your apps');
    expect(link.href).to.equal('https://adobe.com/apps/a/school.example.org');
  });

  it('preserves a partial authored continuation link but uses the computed same-tab destination', async () => {
    close();
    modal.remove();
    await mount(true, fixture.replace(
      'Not redirected? Continue to Adobe.com.',
      'Not redirected? Continue to <a href="https://example.com" target="_blank"><em>Adobe.com.</em></a>',
    ));
    await submit();
    const continuation = block.querySelector('.entitlement-check-continue');
    const link = continuation.querySelector('a');
    expect(continuation.textContent).to.equal('Not redirected? Continue to Adobe.com.');
    expect(link.querySelector('em').textContent).to.equal('Adobe.com.');
    expect(link.href).to.equal('https://adobe.com/apps/a/school.example.org');
    expect(link.hasAttribute('target')).to.equal(false);
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
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
      expect(block.querySelector('form').hasAttribute('aria-busy')).to.equal(false);
      expect(window.lana.log.firstCall.args[0]).to.equal('Entitlement check: eligibility request failed');
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
    expect(JSON.stringify(window.lana.log.args)).not.to.include('student@school.example.org');
    expect(clock.countTimers()).to.equal(0);
  });

  it('announces loading and prevents duplicate requests', async () => {
    let resolve;
    request.returns(new Promise((done) => { resolve = done; }));
    await submit();
    const form = block.querySelector('form');
    expect(form.getAttribute('aria-busy')).to.equal('true');
    expect(block.querySelector('input').readOnly).to.equal(true);
    expect(block.querySelector('button').disabled).to.equal(true);
    expect(block.querySelector('[role="status"]').textContent).to.equal('Checking eligibility...');
    form.requestSubmit();
    expect(request.callCount).to.equal(1);
    resolve({ ok: true, json: async () => ({ status: 'ELIGIBLE' }) });
    await clock.tickAsync(0);
    expect(block.dataset.state).to.equal('success');
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
  });

  it('cancels navigation timers on page exit and creates a fresh form on reopen', async () => {
    await submit();
    window.dispatchEvent(new Event('pagehide'));
    expect(clock.countTimers()).to.equal(0);
    modal.remove();
    await mount();
    expect(block.dataset.state).to.equal('form');
    expect(block.querySelector('input').value).to.equal('');
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
});
