import { setLibs } from './mocks/scripts.js';

const libs = '/libs';
setLibs(libs);
const { setConfig } = await import(`${libs}/utils/utils.js`);
setConfig({ codeRoot: '/edu', miloLibs: libs });
await import(`${libs}/blocks/modal/modal.js`);
document.documentElement.dataset.ready = 'true';
