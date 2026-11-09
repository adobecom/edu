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
  'service-error', 'success-heading', 'success-description',
  'success-cta', 'rejected-heading',
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
    || (config['checkbox-error'] && !config['checkbox-error'].textContent.trim())
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
  const { getConfig } = await import(`${getLibs()}/utils/utils.js`);
  if (modal?.dataset.closing) return;
  const host = getConfig().env?.name === 'prod'
    ? 'https://edu-org.adobe.io' : 'https://edu-org-stage.adobe.io';
  instance += 1;
  const id = `entitlement-check-email-${instance}`;
  const text = (key) => config[key].textContent.trim();
  const personalEmailError = config['personal-email-error']
    ? text('personal-email-error')
    : 'Make sure to use your school email, not your personal email.';
  const checkboxError = config['checkbox-error']
    ? text('checkbox-error') : 'Please select the checkbox to continue.';
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
  const consent = document.createElement('input');
  consent.id = `${id}-consent`;
  consent.name = 'consent';
  consent.type = 'checkbox';
  consent.required = true;
  consent.className = 'entitlement-check-consent-input';
  consent.setAttribute('aria-describedby', error.id);
  const legal = document.createElement('label');
  legal.htmlFor = consent.id;
  legal.className = 'entitlement-check-legal';
  const legalCopy = content(config, 'legal-copy', 'entitlement-check-legal');
  // Keep authored paragraphs and links within the label's phrasing content.
  legalCopy.querySelectorAll('p').forEach((paragraph) => {
    const span = document.createElement('span');
    span.className = 'entitlement-check-legal-paragraph';
    span.append(...paragraph.childNodes);
    paragraph.replaceWith(span);
  });
  legal.append(...legalCopy.childNodes);
  const consentRow = document.createElement('div');
  consentRow.className = 'entitlement-check-consent';
  consentRow.append(consent, legal);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'con-button blue entitlement-check-submit';
  submit.setAttribute('aria-label', text('submit-label'));
  const submitLabel = document.createElement('span');
  submitLabel.className = 'entitlement-check-submit-label';
  submitLabel.textContent = text('submit-label');
  const progress = document.createElement('span');
  progress.className = 'spectrum-ProgressCircle spectrum-ProgressCircle--indeterminate';
  progress.hidden = true;
  progress.setAttribute('aria-hidden', 'true');
  const track = progress.appendChild(document.createElement('span'));
  track.className = 'spectrum-ProgressCircle-track';
  const fills = progress.appendChild(document.createElement('span'));
  fills.className = 'spectrum-ProgressCircle-fills';
  [1, 2].forEach((number) => {
    const mask = fills.appendChild(document.createElement('span'));
    mask.className = `spectrum-ProgressCircle-fillMask${number}`;
    const subMask = mask.appendChild(document.createElement('span'));
    subMask.className = `spectrum-ProgressCircle-fillSubMask${number}`;
    const fill = subMask.appendChild(document.createElement('span'));
    fill.className = 'spectrum-ProgressCircle-fill';
  });
  submit.append(progress, submitLabel);
  fields.append(label, input, errorSlot, consentRow, submit);
  form.append(intro, fields);
  block.replaceChildren(form);
  block.dataset.state = 'form';
  modal?.classList.add('entitlement-check-modal');

  let disposed = false;
  let busy = false;
  let controller;
  let requestTimer;
  let errorField;

  function dispose(event) {
    if (event?.type === 'milo:modal:closed' && (!modal || event.detail?.id !== modal.id)) return;
    controller?.abort();
    window.clearTimeout(requestTimer);
    // A cached page can be restored; leave its form usable for another attempt.
    if (event?.type === 'pagehide' && event.persisted) return;
    disposed = true;
    // Milo broadcasts before removing the dialog, so scope cleanup to this instance.
    window.removeEventListener('milo:modal:closed', dispose);
    window.removeEventListener('pagehide', dispose);
  }

  if (modal) window.addEventListener('milo:modal:closed', dispose);
  window.addEventListener('pagehide', dispose);

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    consent.removeAttribute('aria-invalid');
    errorField = undefined;
  }

  function showError(message, invalidField) {
    clearError();
    error.textContent = message;
    error.hidden = false;
    errorField = invalidField;
    if (invalidField) {
      invalidField.setAttribute('aria-invalid', 'true');
      invalidField.focus();
    }
  }

  input.addEventListener('input', () => {
    if (errorField !== consent) clearError();
  });
  consent.addEventListener('change', () => {
    if (errorField === consent) clearError();
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
      const link = document.createElement('a');
      link.className = 'con-button blue entitlement-check-continue';
      link.textContent = text('success-cta');
      link.href = destination;
      link.addEventListener('click', dispose);
      result.append(link);
    } else {
      const link = config['rejected-cta'].querySelector('a').cloneNode(true);
      link.className = 'con-button blue entitlement-check-trial';
      result.append(link);
    }
    block.replaceChildren(result);
    block.dataset.state = prefix;
    modal?.setAttribute('aria-label', title.textContent.trim());
    title.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || disposed) return;
    input.value = input.value.trim();
    if (!input.validity.valid) {
      showError(text(input.validity.valueMissing ? 'required-error' : 'invalid-email-error'), input);
      return;
    }
    const email = input.value;
    const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
      showError(personalEmailError, input);
      return;
    }
    if (!consent.checked) {
      showError(checkboxError, consent);
      return;
    }
    clearError();
    busy = true;
    input.readOnly = true;
    consent.disabled = true;
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    progress.hidden = false;
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
      if (!disposed && block.isConnected && !modal?.dataset.closing) {
        logError('eligibility request failed');
        showError(text('service-error'));
      }
      return;
    } finally {
      window.clearTimeout(requestTimer);
      busy = false;
      input.readOnly = false;
      consent.disabled = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      progress.hidden = true;
    }
    if (disposed || !block.isConnected || modal?.dataset.closing) return;
    const modalLabel = modal?.getAttribute('aria-label') ?? null;
    try {
      showResult(['HAS_ACCESS', 'ELIGIBLE'].includes(eligibilityStatus), domain);
    } catch (e) {
      logError('result rendering failed');
      if (disposed || !block.isConnected || modal?.dataset.closing) return;
      block.replaceChildren(form);
      block.dataset.state = 'form';
      if (modalLabel === null) modal?.removeAttribute('aria-label');
      else modal?.setAttribute('aria-label', modalLabel);
      showError(text('service-error'));
      input.focus();
    }
  });
}
