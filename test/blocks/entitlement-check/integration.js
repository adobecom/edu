import { setLibs } from './mocks/scripts.js';

const libs = '/libs';
setLibs(libs);
const { setConfig, loadArea } = await import(`${libs}/utils/utils.js`);
setConfig({ codeRoot: '/edu', miloLibs: libs });
if (new URLSearchParams(window.location.search).has('inline')) {
  const response = await fetch('/test/blocks/entitlement-check/fragment.plain.html');
  if (!response.ok) throw new Error('Unable to load inline entitlement-check fixture.');
  const main = document.querySelector('main');
  main.innerHTML = await response.text();
  await loadArea(main);
} else {
  await import(`${libs}/blocks/modal/modal.js`);
}
document.documentElement.dataset.ready = 'true';
