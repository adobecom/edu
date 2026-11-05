import { getLibs } from '../../scripts/scripts.js';

const OFFER_ID = '92645C312E8ADE0DB7071A82AD389C8E';
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com', 'live.in', 'msn.com',
  'rediffmail.com', 'rediff.com',
  'icloud.com', 'me.com', 'mac.com',
  'zoho.com', 'zohomail.in', 'zohomail.com',
  'protonmail.com', 'proton.me',
  'aol.com', 'mail.com', 'gmx.com', 'yandex.com', 'indiatimes.com', 'sify.com', 'tutanota.com',
]);
const REQUIRED_KEYS = [
  'form-heading', 'form-description', 'email-label', 'email-placeholder',
  'submit-label', 'legal-copy', 'required-error', 'invalid-email-error',
  'service-error', 'loading-label', 'success-heading', 'success-description',
  'success-redirect-notice', 'success-cta-label', 'rejected-heading',
  'rejected-description', 'rejected-cta',
];
let instance = 0;

function logError(message) {
  window.lana?.log(`Entitlement check: ${message}`, { tags: 'entitlement-check', severity: 'error' });
}

function readConfig(block) {
  const config = {};
  [...block.children].forEach((row) => {
    const [key, value] = row.children;
    if (key && value) config[key.textContent.trim().toLowerCase()] = value;
  });
  const cta = config['rejected-cta']?.querySelector('a');
  const personalEmailError = config['personal-email-error'];
  if (REQUIRED_KEYS.some((key) => !config[key]?.textContent.trim())
    || (personalEmailError && !personalEmailError.textContent.trim())
    || !cta?.textContent.trim() || !cta.getAttribute('href')?.trim()
    || !['https:', 'http:'].includes(cta.protocol)) {
    logError('invalid authoring configuration');
    throw new Error('Invalid entitlement-check authoring configuration.');
  }
  return config;
}

function content(config, key, className) {
  const element = config[key].cloneNode(true);
  element.className = className;
  return element;
}

function heading(config, key) {
  const authored = config[key].querySelector('h1, h2, h3, h4, h5, h6');
  const element = authored ? authored.cloneNode(true) : document.createElement('h2');
  if (!authored) element.textContent = config[key].textContent.trim();
  element.className = 'entitlement-check-heading';
  if (key === 'success-heading' && Intl.Segmenter && !element.querySelector('br')) {
    const [first, second] = new Intl.Segmenter(document.documentElement.lang || undefined, { granularity: 'sentence' }).segment(element.textContent);
    if (second) {
      // Separate the mobile lead sentence without replacing localized copy or inline markup.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let offset = first.segment.length;
      while (offset > node.length) {
        offset -= node.length;
        node = walker.nextNode();
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      range.setEnd(node, offset);
      const lead = document.createElement('span');
      lead.className = 'entitlement-check-heading-lead';
      lead.append(range.extractContents());
      element.prepend(lead);
    }
  }
  return element;
}

export default async function init(block) {
  const config = readConfig(block);
  const modal = block.closest('.dialog-modal');
  if (!modal) {
    logError('missing Milo modal');
    throw new Error('Entitlement-check must be inside a Milo modal.');
  }
  const { getConfig } = await import(`${getLibs()}/utils/utils.js`);
  if (modal.dataset.closing) return;
  const host = getConfig().env?.name === 'prod'
    ? 'https://edu-org.adobe.io' : 'https://edu-org-stage.adobe.io';
  instance += 1;
  const id = `entitlement-check-email-${instance}`;
  const text = (key) => config[key].textContent.trim();
  const personalEmailError = config['personal-email-error']
    ? text('personal-email-error')
    : 'Make sure to use your school email, not your personal email.';
  const form = document.createElement('form');
  form.noValidate = true;
  const intro = document.createElement('div');
  intro.className = 'entitlement-check-intro';
  intro.append(heading(config, 'form-heading'), content(config, 'form-description', 'entitlement-check-description'));
  const fields = document.createElement('div');
  fields.className = 'entitlement-check-fields';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = text('email-label');
  const input = document.createElement('input');
  input.id = id;
  input.name = 'email';
  input.type = 'email';
  input.required = true;
  input.autocomplete = 'email';
  input.inputMode = 'email';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.placeholder = text('email-placeholder');
  input.setAttribute('aria-describedby', `${id}-error`);
  const error = document.createElement('p');
  error.id = `${id}-error`;
  error.className = 'entitlement-check-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const errorSlot = document.createElement('div');
  errorSlot.className = 'entitlement-check-error-slot';
  errorSlot.append(error);
  const legal = content(config, 'legal-copy', 'entitlement-check-legal');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'con-button blue entitlement-check-submit';
  submit.textContent = text('submit-label');
  const status = document.createElement('p');
  status.className = 'entitlement-check-status';
  status.setAttribute('role', 'status');
  fields.append(label, input, errorSlot, legal, submit);
  form.append(intro, fields);
  block.replaceChildren(form, status);
  block.dataset.state = 'form';
  modal.classList.add('entitlement-check-modal');

  let disposed = false;
  let busy = false;
  let controller;
  let redirectTimer;
  let requestTimer;

  function dispose(event) {
    if (event?.type === 'milo:modal:closed' && event.detail?.id !== modal.id) return;
    controller?.abort();
    window.clearTimeout(redirectTimer);
    window.clearTimeout(requestTimer);
    // A cached page can be restored; leave its form usable for another attempt.
    if (event?.type === 'pagehide' && event.persisted) return;
    disposed = true;
    // Milo broadcasts before removing the dialog, so scope cleanup to this instance.
    window.removeEventListener('milo:modal:closed', dispose);
    window.removeEventListener('pagehide', dispose);
  }

  window.addEventListener('milo:modal:closed', dispose);
  window.addEventListener('pagehide', dispose);

  function showError(message, invalid = false) {
    error.textContent = message;
    error.hidden = false;
    if (invalid) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  }

  input.addEventListener('input', () => {
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  });

  function showResult(eligible, domain) {
    const prefix = eligible ? 'success' : 'rejected';
    const result = document.createElement('div');
    result.className = 'entitlement-check-result';
    const title = heading(config, `${prefix}-heading`);
    title.tabIndex = -1;
    if (eligible) {
      const checkmark = document.createElement('span');
      checkmark.className = 'entitlement-check-checkmark';
      checkmark.setAttribute('aria-hidden', 'true');
      result.append(checkmark);
    }
    result.append(title, content(config, `${prefix}-description`, 'entitlement-check-description'));
    if (eligible) {
      const destination = `https://adobe.com/apps/a/${encodeURIComponent(domain)}`;
      const continuation = content(config, 'success-cta-label', 'entitlement-check-continue');
      if (!continuation.querySelector('a')) {
        const link = document.createElement('a');
        const labelText = text('success-cta-label');
        const destinationHost = new URL(destination).hostname;
        const start = labelText.toLowerCase().indexOf(destinationHost);
        if (start === -1) {
          link.textContent = labelText;
          continuation.replaceChildren(link);
        } else {
          const end = start + destinationHost.length
            + (labelText[start + destinationHost.length] === '.' ? 1 : 0);
          link.textContent = labelText.slice(start, end);
          link.setAttribute('aria-label', labelText);
          continuation.replaceChildren(labelText.slice(0, start), link, labelText.slice(end));
        }
      }
      continuation.querySelectorAll('a').forEach((link) => {
        link.href = destination;
        link.removeAttribute('target');
        link.addEventListener('click', dispose);
      });
      result.append(content(config, 'success-redirect-notice', 'entitlement-check-redirect'), continuation);
      redirectTimer = window.setTimeout(() => {
        if (!disposed && block.isConnected && !modal.dataset.closing) {
          dispose();
          window.location.assign(destination);
        }
      }, 2000);
    } else {
      const link = config['rejected-cta'].querySelector('a').cloneNode(true);
      link.className = 'con-button blue entitlement-check-trial';
      result.append(link);
    }
    block.replaceChildren(result);
    block.dataset.state = prefix;
    modal.setAttribute('aria-label', title.textContent.trim());
    title.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || disposed) return;
    input.value = input.value.trim();
    if (!input.validity.valid) {
      showError(text(input.validity.valueMissing ? 'required-error' : 'invalid-email-error'), true);
      return;
    }
    const email = input.value;
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
      showError(personalEmailError, true);
      return;
    }
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    busy = true;
    input.readOnly = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = text('loading-label');
    controller = new AbortController();
    requestTimer = window.setTimeout(() => controller.abort(), 15000);
    let eligibilityStatus;
    try {
      const response = await fetch(`${host}/v1/entitlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'acom-education' },
        body: JSON.stringify({ email, offerId: OFFER_ID }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Eligibility HTTP error.');
      const data = await response.json();
      if (typeof data?.status !== 'string' || !data.status.trim()) {
        throw new Error('Invalid eligibility response.');
      }
      if (controller.signal.aborted) throw new Error('Eligibility request aborted.');
      eligibilityStatus = data.status;
    } catch (e) {
      if (!disposed && block.isConnected && !modal.dataset.closing) {
        logError('eligibility request failed');
        showError(text('service-error'));
      }
      return;
    } finally {
      window.clearTimeout(requestTimer);
      busy = false;
      input.readOnly = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      status.textContent = '';
    }
    if (disposed || !block.isConnected || modal.dataset.closing) return;
    showResult(['HAS_ACCESS', 'ELIGIBLE'].includes(eligibilityStatus), domain);
  });
}
