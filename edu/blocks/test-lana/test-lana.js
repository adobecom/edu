import { getLibs } from '../../scripts/utils.js';

let createTag;

export default async function init(el) {
  ({ createTag } = await import(`${getLibs()}/utils/utils.js`));
  const button = createTag('button', {}, 'Log to LANA');
  button.addEventListener('click', () => {
    window.lana?.log('testing', { sampleRate: 100 });
  });
  el.append(button);
}
