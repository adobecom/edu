import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../edu/blocks/prompt-card/prompt-card.js';
import { processTrackingLabels } from './mocks/martech/attributes.js';

describe('Prompt card', () => {
  let sandbox;
  let section;
  let clipboard;
  let clock;
  let resize;
  let observer;
  let globals;

  const prompt = 'Summarize this document';
  const cardConfig = { Prefix: 'Learn', Title: 'Summary', Prompt: prompt };
  const groupRows = [
    ['Prefix', 'Title', 'Prompt'],
    ['Learn', 'Summary', prompt],
    ['Create', 'Outline', 'Create an outline'],
    ['Review', 'Feedback', 'Review this document'],
  ];

  function block(classes = '', rows = Object.entries(cardConfig)) {
    const element = document.createElement('div');
    element.className = `prompt-card ${classes}`;
    rows.forEach((values) => {
      const row = document.createElement('div');
      values.forEach((value) => {
        const cell = document.createElement('div');
        cell.textContent = value;
        row.append(cell);
      });
      element.append(row);
    });
    section.append(element);
    return element;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    globals = ['libs', 'mph', 'promptCardTemplate'].map((key) => (
      [key, Object.getOwnPropertyDescriptor(window, key)]
    ));
    window.libs = '/test/blocks/prompt-card/mocks';
    delete window.mph;
    delete window.promptCardTemplate;
    processTrackingLabels.resetHistory();
    section = document.createElement('div');
    section.className = 'section';
    document.body.append(section);
    clipboard = sandbox.stub(navigator.clipboard, 'writeText').resolves();
    clock = sandbox.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    observer = { observe: sandbox.spy(), disconnect: sandbox.spy() };
    sandbox.stub(window, 'ResizeObserver').callsFake((callback) => {
      resize = callback;
      return observer;
    });
  });

  afterEach(() => {
    sandbox.restore();
    section.remove();
    document.querySelector('.prompt-toast')?.remove();
    globals.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(window, key, descriptor);
      else delete window[key];
    });
  });

  it('decorates a standalone card with defaults, accessible controls, and tracking', async () => {
    const element = block();
    await init(element);

    expect(element.children).to.have.lengthOf(1);
    const blade = element.querySelector('.prompt-blade');
    expect(blade.title).to.equal(prompt);
    expect(blade.dataset.toast).to.equal('Copied to clipboard');
    expect(blade.getAttribute('daa-im')).to.equal('true');
    expect(blade.getAttribute('daa-ll')).to.equal('promptcard-tracked-Learn-tracked-Summary');
    expect(processTrackingLabels.args).to.deep.equal([['Learn'], ['Summary']]);
    expect(element.querySelector('.prompt-prefix span').textContent).to.equal('Learn');
    expect(element.querySelector('h3.prompt-title').textContent).to.equal('Summary');
    expect(element.querySelector('.prompt-copy').textContent).to.equal(prompt);
    expect(element.querySelector('input').value).to.equal(prompt);
    const icon = element.querySelector('.prompt-icon');
    expect(icon.getAttribute('src')).to.equal('/edu/img/icons/aichat.svg');
    expect(icon.alt).to.equal('AI Assistant');
    const button = element.querySelector('.prompt-copy-btn');
    expect(button.textContent).to.equal('Copy');
    expect(button.getAttribute('role')).to.equal('button');
    expect(button.tabIndex).to.equal(0);
    expect(button.getAttribute('aria-label')).to.equal(`Copy ${prompt}`);
  });

  it('uses localized default button and toast labels', async () => {
    window.mph = { Copy: 'Copier', 'Copied to clipboard': 'Copié' };
    const element = block();
    await init(element);

    expect(element.querySelector('.prompt-copy-btn').textContent).to.equal('Copier');
    element.querySelector('.prompt-blade').click();
    expect(document.querySelector('.prompt-toast').textContent).to.equal('Copié');
  });

  it('stores templates without rendering and lets card values override their defaults', async () => {
    const customIcon = '/edu/img/icons/aichat.svg?custom';
    const template = block('template', Object.entries({
      Prefix: 'Default prefix',
      Title: 'Default title',
      Icon: customIcon,
      Button: 'Use prompt',
      Toast: 'Prompt copied',
    }));
    await init(template);
    expect(template.isConnected).to.be.false;
    expect(window.promptCardTemplate.button).to.equal('Use prompt');

    const element = block();
    await init(element);
    expect(element.querySelector('.prompt-prefix span').textContent).to.equal('Learn');
    expect(element.querySelector('.prompt-title').textContent).to.equal('Summary');
    expect(element.querySelector('.prompt-icon').getAttribute('src')).to.equal(customIcon);
    expect(element.querySelector('.prompt-copy-btn').textContent).to.equal('Use prompt');
    element.querySelector('.prompt-blade').click();
    expect(document.querySelector('.prompt-toast').textContent).to.equal('Prompt copied');
  });

  it('copies on card click and dismisses the toast after five seconds', async () => {
    const element = block();
    await init(element);
    element.querySelector('.prompt-title').click();

    expect(clipboard.calledOnceWithExactly(prompt)).to.be.true;
    const toast = document.querySelector('.prompt-toast');
    expect(toast.classList.contains('prompt-toast--show')).to.be.true;
    clock.tick(4999);
    expect(toast.classList.contains('prompt-toast--show')).to.be.true;
    clock.tick(1);
    expect(toast.classList.contains('prompt-toast--show')).to.be.false;
  });

  it('reuses the toast across cards, updates its message, and supports dismissal', async () => {
    const first = block();
    const second = block('', Object.entries({ ...cardConfig, Prompt: 'Another prompt', Toast: 'Another message' }));
    await init(first);
    await init(second);
    first.querySelector('.prompt-blade').click();
    const toast = document.querySelector('.prompt-toast');
    toast.querySelector('.prompt-close').click();
    expect(toast.classList.contains('prompt-toast--show')).to.be.false;

    second.querySelector('.prompt-copy-btn').click();
    expect(clipboard.args).to.deep.equal([[prompt], ['Another prompt']]);
    expect(document.querySelectorAll('.prompt-toast')).to.have.lengthOf(1);
    expect(document.querySelector('.prompt-toast')).to.equal(toast);
    expect(toast.textContent).to.equal('Another message');
    expect(toast.classList.contains('prompt-toast--show')).to.be.true;
  });

  ['Enter', ' '].forEach((key) => {
    it(`copies on the ${key === ' ' ? 'Space' : key} key and prevents its default action`, async () => {
      const element = block();
      await init(element);
      const event = new KeyboardEvent('keypress', { key, cancelable: true, bubbles: true });
      element.querySelector('.prompt-copy-btn').dispatchEvent(event);

      expect(clipboard.calledOnceWithExactly(prompt)).to.be.true;
      expect(event.defaultPrevented).to.be.true;
    });
  });

  it('ignores unrelated keys on the copy control', async () => {
    const element = block();
    await init(element);
    const event = new KeyboardEvent('keypress', { key: 'Escape', cancelable: true });
    element.querySelector('.prompt-copy-btn').dispatchEvent(event);

    expect(clipboard.called).to.be.false;
    expect(event.defaultPrevented).to.be.false;
    expect(document.querySelector('.prompt-toast')).to.be.null;
  });

  it('renders inline groups in order and announces repeated copies to screen readers', async () => {
    const element = block('group', groupRows);
    await init(element);

    expect(element.isConnected).to.be.false;
    const cards = [...section.querySelectorAll('.prompt-card')];
    expect(cards.map((card) => card.querySelector('.prompt-title').textContent))
      .to.deep.equal(['Summary', 'Outline', 'Feedback']);
    const liveRegion = section.querySelector('.prompt-a11y-action');
    expect(liveRegion.getAttribute('aria-live')).to.equal('polite');
    expect(liveRegion.textContent).to.equal('');
    cards[0].querySelector('.prompt-blade').click();
    expect(liveRegion.textContent).to.equal('Copied to clipboard');
    cards[0].querySelector('.prompt-blade').click();
    expect(liveRegion.textContent).to.equal('Copied to clipboard.');
    cards[0].querySelector('.prompt-blade').click();
    expect(liveRegion.textContent).to.equal('Copied to clipboard');
  });

  it('applies a shared template to an inline group', async () => {
    await init(block('template', [['Button', 'Use prompt'], ['Toast', 'Done']]));
    await init(block('group', groupRows));

    const buttons = [...section.querySelectorAll('.prompt-copy-btn')];
    expect(buttons.map((button) => button.textContent))
      .to.deep.equal(['Use prompt', 'Use prompt', 'Use prompt']);
    buttons[1].click();
    expect(clipboard.calledOnceWithExactly('Create an outline')).to.be.true;
    expect(section.querySelector('.prompt-a11y-action').textContent).to.equal('Done');
  });

  it('reads template-group options before the separator and tabular data', async () => {
    const element = block('template group', [
      ['Button', 'Use prompt'], ['Toast', 'Done'], ['Prompts'], ...groupRows,
    ]);
    await init(element);

    expect(element.isConnected).to.be.false;
    expect(section.querySelectorAll('.prompt-card')).to.have.lengthOf(3);
    expect(section.querySelector('.prompt-copy-btn').textContent).to.equal('Use prompt');
    expect(section.querySelector('.prompt-title').textContent).to.equal('Summary');
    expect(window.promptCardTemplate).to.be.undefined;
  });

  it('fetches JSON groups and filters records by all configured fields', async () => {
    const fetch = sandbox.stub(window, 'fetch').resolves({
      ok: true,
      json: async () => ({
        data: [
          { prefix: 'Learn', title: 'Summary', prompt },
          { prefix: 'Learn', title: 'Other', prompt: 'Other title' },
          { prefix: 'Create', title: 'Summary', prompt: 'Other prefix' },
        ],
      }),
    });
    await init(block('json', [
      ['JSON', '/prompts.json'], ['Prefix', 'Learn'], ['Title', 'Summary'], ['Rows', '1'],
    ]));

    expect(fetch.calledOnceWithExactly('/prompts.json')).to.be.true;
    expect(section.querySelectorAll('.prompt-card')).to.have.lengthOf(1);
    expect(section.querySelector('.prompt-copy').textContent).to.equal(prompt);
  });

  it('renders every JSON record when no filters are specified', async () => {
    const data = groupRows.slice(1).map(
      ([prefix, title, text]) => ({ prefix, title, prompt: text }),
    );
    sandbox.stub(window, 'fetch').resolves({
      ok: true,
      json: async () => ({ data }),
    });
    await init(block('json', [['JSON', '/prompts.json']]));

    expect([...section.querySelectorAll('.prompt-title')].map((title) => title.textContent))
      .to.deep.equal(['Summary', 'Outline', 'Feedback']);
  });

  it('removes a JSON group when the request fails without parsing the response', async () => {
    const json = sandbox.spy();
    sandbox.stub(window, 'fetch').resolves({ ok: false, json });
    const element = block('json', [['JSON', '/missing.json']]);
    await init(element);

    expect(element.isConnected).to.be.false;
    expect(section.children).to.have.lengthOf(0);
    expect(json.called).to.be.false;
  });

  it('renders no cards when JSON filters match no records', async () => {
    sandbox.stub(window, 'fetch').resolves({
      ok: true,
      json: async () => ({ data: [{ prefix: 'Learn', title: 'Summary', prompt }] }),
    });
    const element = block('json', [['JSON', '/prompts.json'], ['Prefix', 'Missing']]);
    await init(element);

    expect(element.isConnected).to.be.false;
    expect(section.querySelectorAll('.prompt-card')).to.have.lengthOf(0);
  });

  async function limitedGroup(rows = '1') {
    window.promptCardTemplate = { rows };
    await init(block('group', groupRows));
    return [...section.querySelectorAll('.prompt-card')];
  }

  it('limits visible cards to the configured rows and responds to grid column changes', async () => {
    const cards = await limitedGroup('2');
    expect(observer.observe.calledOnceWithExactly(section)).to.be.true;
    expect(cards.map((card) => card.classList.contains('hidden'))).to.deep.equal([false, true, true]);

    section.style.gridTemplateColumns = '100px';
    resize();
    expect(cards.map((card) => card.classList.contains('hidden'))).to.deep.equal([false, false, true]);
    expect(section.querySelector('.view-all')).not.to.be.null;

    section.style.gridTemplateColumns = '100px 100px';
    resize();
    expect(cards.every((card) => !card.classList.contains('hidden'))).to.be.true;
    expect(section.querySelector('.view-all')).to.be.null;
    expect(observer.disconnect.calledOnce).to.be.true;
  });

  it('leaves visibility unchanged when the grid column layout is unresolved', async () => {
    const cards = await limitedGroup();
    sandbox.stub(window, 'getComputedStyle').returns({ gridTemplateColumns: 'none' });
    resize();

    expect(cards.map((card) => card.classList.contains('hidden'))).to.deep.equal([false, true, true]);
    expect(section.querySelector('.view-all')).not.to.be.null;
    expect(observer.disconnect.called).to.be.false;
  });

  it('reveals all cards and disconnects observation when View all is clicked', async () => {
    window.mph = { 'View all': 'Voir tout' };
    const cards = await limitedGroup();
    const button = section.querySelector('.view-all .con-button');
    expect(button.textContent).to.equal('Voir tout');
    button.click();

    expect(cards.every((card) => !card.classList.contains('hidden'))).to.be.true;
    expect(section.querySelector('.view-all')).to.be.null;
    expect(observer.disconnect.calledOnce).to.be.true;
  });
});
