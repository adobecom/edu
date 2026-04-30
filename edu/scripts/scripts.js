/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const STYLES = ['/edu/styles/styles.css'];

const LIBS = '/libs';

export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      libs = (() => {
        const { hostname, search } = location || window.location;
        if (!['.aem.', '.stage.', 'local', '.da.'].some((i) => hostname.includes(i))) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (!/^[a-zA-Z0-9_-]+$/.test(branch)) throw new Error('Invalid branch name.');
        if (branch === 'local') return 'http://localhost:6456/libs';
        return branch.includes('--') ? `https://${branch}.aem.live/libs` : `https://${branch}--milo--adobecom.aem.live/libs`;
      })();
      return libs;
    }, () => libs,
  ];
})();

const getLocale = (locales, pathname = window.location.pathname) => {
  if (!locales) {
    return { ietf: 'en-US', tk: 'hah7vzn.css', prefix: '' };
  }
  const LANGSTORE = 'langstore';
  const split = pathname.split('/');
  const localeString = split[1];
  const locale = locales[localeString] || locales[''];
  if (localeString === LANGSTORE) {
    locale.prefix = `/${localeString}/${split[2]}`;
    if (
      Object.values(locales)
        .find((loc) => loc.ietf?.startsWith(split[2]))?.dir === 'rtl'
    ) locale.dir = 'rtl';
    return locale;
  }
  const isUS = locale.ietf === 'en-US';
  locale.prefix = isUS ? '' : `/${localeString}`;
  locale.region = isUS ? 'us' : localeString.split('_')[0];
  return locale;
};

// eslint-disable-next-line no-unused-vars
export function decorateArea(area = document) {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    img?.removeAttribute('loading');
  };

  (async function loadLCPImage() {
    const marquee = document.querySelector('.marquee');
    if (!marquee) {
      eagerLoad(document, 'img');
      return;
    }

    // First image of first row
    eagerLoad(marquee, 'div:first-child img');
    // Last image of last column of last row
    eagerLoad(marquee, 'div:last-child > div:last-child img');
  }());
}

const CONFIG = {
  codeRoot: '/edu',
  contentRoot: '/edu-shared',
  imsClientId: 'acom-education',
  imsScope: 'AdobeID,openid,gnav,pps.read,firefly_api,additional_info.roles,read_organizations,account_cluster.read',
  // geoRouting: 'off',
  // fallbackRouting: 'off',
  // iconsExcludeBlocks: [],
  decorateArea,
  // brought over from cc
  locales: {
    // Americas
    ar: { ietf: 'es-AR', tk: 'oln4yqj.css' },
    br: { ietf: 'pt-BR', tk: 'inq1xob.css' },
    ca: { ietf: 'en-CA', tk: 'pps7abe.css' },
    ca_fr: { ietf: 'fr-CA', tk: 'vrk5vyv.css', base: 'fr' },
    cl: { ietf: 'es-CL', tk: 'oln4yqj.css' },
    co: { ietf: 'es-CO', tk: 'oln4yqj.css' },
    la: { ietf: 'es-LA', tk: 'oln4yqj.css' },
    mx: { ietf: 'es-MX', tk: 'oln4yqj.css' },
    pe: { ietf: 'es-PE', tk: 'oln4yqj.css' },
    '': { ietf: 'en-US', tk: 'hah7vzn.css' },
    // EMEA
    africa: { ietf: 'en', tk: 'pps7abe.css' },
    be_fr: { ietf: 'fr-BE', tk: 'vrk5vyv.css', base: 'fr' },
    be_en: { ietf: 'en-BE', tk: 'pps7abe.css' },
    be_nl: { ietf: 'nl-BE', tk: 'cya6bri.css' },
    cy_en: { ietf: 'en-CY', tk: 'pps7abe.css' },
    dk: { ietf: 'da-DK', tk: 'aaz7dvd.css' },
    de: { ietf: 'de-DE', tk: 'vin7zsi.css' },
    ee: { ietf: 'et-EE', tk: 'aaz7dvd.css' },
    es: { ietf: 'es-ES', tk: 'oln4yqj.css' },
    fr: { ietf: 'fr-FR', tk: 'vrk5vyv.css' },
    gr_en: { ietf: 'en-GR', tk: 'pps7abe.css' },
    ie: { ietf: 'en-GB', tk: 'pps7abe.css' },
    il_en: { ietf: 'en-IL', tk: 'pps7abe.css' },
    it: { ietf: 'it-IT', tk: 'bbf5pok.css' },
    lv: { ietf: 'lv-LV', tk: 'aaz7dvd.css' },
    lt: { ietf: 'lt-LT', tk: 'aaz7dvd.css' },
    lu_de: { ietf: 'de-LU', tk: 'vin7zsi.css' },
    lu_en: { ietf: 'en-LU', tk: 'pps7abe.css' },
    lu_fr: { ietf: 'fr-LU', tk: 'vrk5vyv.css', base: 'fr' },
    hu: { ietf: 'hu-HU', tk: 'aaz7dvd.css' },
    mt: { ietf: 'en-MT', tk: 'pps7abe.css' },
    mena_en: { ietf: 'en', tk: 'pps7abe.css' },
    nl: { ietf: 'nl-NL', tk: 'cya6bri.css' },
    no: { ietf: 'no-NO', tk: 'aaz7dvd.css' },
    pl: { ietf: 'pl-PL', tk: 'aaz7dvd.css' },
    pt: { ietf: 'pt-PT', tk: 'inq1xob.css' },
    ro: { ietf: 'ro-RO', tk: 'aaz7dvd.css' },
    sa_en: { ietf: 'en', tk: 'pps7abe.css' },
    ch_de: { ietf: 'de-CH', tk: 'vin7zsi.css' },
    si: { ietf: 'sl-SI', tk: 'aaz7dvd.css' },
    sk: { ietf: 'sk-SK', tk: 'aaz7dvd.css' },
    ch_fr: { ietf: 'fr-CH', tk: 'vrk5vyv.css', base: 'fr' },
    fi: { ietf: 'fi-FI', tk: 'aaz7dvd.css' },
    se: { ietf: 'sv-SE', tk: 'fpk1pcd.css' },
    ch_it: { ietf: 'it-CH', tk: 'bbf5pok.css' },
    tr: { ietf: 'tr-TR', tk: 'aaz7dvd.css' },
    ae_en: { ietf: 'en', tk: 'pps7abe.css' },
    uk: { ietf: 'en-GB', tk: 'pps7abe.css' },
    at: { ietf: 'de-AT', tk: 'vin7zsi.css' },
    cz: { ietf: 'cs-CZ', tk: 'aaz7dvd.css' },
    bg: { ietf: 'bg-BG', tk: 'aaz7dvd.css' },
    ru: { ietf: 'ru-RU', tk: 'aaz7dvd.css' },
    ua: { ietf: 'uk-UA', tk: 'aaz7dvd.css' },
    il_he: { ietf: 'he', tk: 'nwq1mna.css', dir: 'rtl' },
    ae_ar: { ietf: 'ar', tk: 'nwq1mna.css', dir: 'rtl' },
    mena_ar: { ietf: 'ar', tk: 'dis2dpj.css', dir: 'rtl' },
    sa_ar: { ietf: 'ar', tk: 'nwq1mna.css', dir: 'rtl' },
    // Asia Pacific
    au: { ietf: 'en-AU', tk: 'pps7abe.css' },
    hk_en: { ietf: 'en-HK', tk: 'pps7abe.css' },
    in: { ietf: 'en-GB', tk: 'pps7abe.css' },
    id_id: { ietf: 'id', tk: 'czc0mun.css' },
    id_en: { ietf: 'en', tk: 'pps7abe.css' },
    my_ms: { ietf: 'ms', tk: 'sxj4tvo.css' },
    my_en: { ietf: 'en-GB', tk: 'pps7abe.css' },
    nz: { ietf: 'en-GB', tk: 'pps7abe.css' },
    ph_en: { ietf: 'en', tk: 'pps7abe.css' },
    ph_fil: { ietf: 'fil-PH', tk: 'ict8rmp.css' },
    sg: { ietf: 'en-SG', tk: 'pps7abe.css' },
    th_en: { ietf: 'en', tk: 'pps7abe.css' },
    in_hi: { ietf: 'hi', tk: 'aaa8deh.css' },
    th_th: { ietf: 'th', tk: 'lqo2bst.css' },
    cn: { ietf: 'zh-CN', tk: 'puu3xkp' },
    hk_zh: { ietf: 'zh-HK', tk: 'jay0ecd' },
    tw: { ietf: 'zh-TW', tk: 'jay0ecd' },
    jp: { ietf: 'ja-JP', tk: 'dvg6awq' },
    kr: { ietf: 'ko-KR', tk: 'qjs5sfm' },
    // Langstore Support.
    langstore: { ietf: 'en-US', tk: 'hah7vzn.css' },
    // geo expansion MWPW-125686
    za: { ietf: 'en-GB', tk: 'pps7abe.css' }, // South Africa (GB English)
    ng: { ietf: 'en-GB', tk: 'pps7abe.css' }, // Nigeria (GB English)
    cr: { ietf: 'es-419', tk: 'oln4yqj.css' }, // Costa Rica (Spanish Latin America)
    ec: { ietf: 'es-419', tk: 'oln4yqj.css' }, // Ecuador (Spanish Latin America)
    pr: { ietf: 'es-419', tk: 'oln4yqj.css' }, // Puerto Rico (Spanish Latin America)
    gt: { ietf: 'es-419', tk: 'oln4yqj.css' }, // Guatemala (Spanish Latin America)
    eg_ar: { ietf: 'ar', tk: 'nwq1mna.css', dir: 'rtl' }, // Egypt (Arabic)
    kw_ar: { ietf: 'ar', tk: 'nwq1mna.css', dir: 'rtl' }, // Kuwait (Arabic)
    qa_ar: { ietf: 'ar', tk: 'nwq1mna.css', dir: 'rtl' }, // Qatar (Arabic)
    eg_en: { ietf: 'en-GB', tk: 'pps7abe.css' }, // Egypt (GB English)
    kw_en: { ietf: 'en-GB', tk: 'pps7abe.css' }, // Kuwait (GB English)
    qa_en: { ietf: 'en-GB', tk: 'pps7abe.css' }, // Qatar (GB English)
    gr_el: { ietf: 'el', tk: 'fnx0rsr.css' }, // Greece (Greek)
    vn_en: { ietf: 'en-GB', tk: 'hah7vzn.css' },
    vn_vi: { ietf: 'vi', tk: 'qxw8hzm.css' },
    cis_ru: { ietf: 'ru', tk: 'qxw8hzm.css' },
    cis_en: { ietf: 'en', tk: 'pps7abe.css' },
  },
  stageDomainsMap: {
    'www.stage.adobe.com': {
      'www.adobe.com(?!\\/*\\S*\\/(mini-plans|plans-fragments\\/modals|genuine(\\.html)?\\/?)\\S*)': 'origin',
      'business.adobe.com': 'business.stage.adobe.com',
      'helpx.adobe.com': 'helpx.stage.adobe.com',
      'blog.adobe.com': 'blog.stage.adobe.com',
      'developer.adobe.com': 'developer-stage.adobe.com',
      'news.adobe.com': 'news.stage.adobe.com',
      'firefly.adobe.com': 'firefly-stage.corp.adobe.com',
      'creativecloud.adobe.com': 'stage.creativecloud.adobe.com',
      'projectneo.adobe.com': 'stg.projectneo.adobe.com',
    },
    '--edu--adobecom.aem.live': {
      'www.adobe.com': 'www.adobe.com',
      'business.adobe.com': 'business.adobe.com',
      'helpx.adobe.com': 'helpx.adobe.com',
      'blog.adobe.com': 'blog.adobe.com',
      'developer.adobe.com': 'developer.adobe.com',
      'news.adobe.com': 'news.adobe.com',
      'firefly.adobe.com': 'firefly.adobe.com',
      'creativecloud.adobe.com': 'creativecloud.adobe.com',
      'projectneo.adobe.com': 'projectneo.adobe.com',
    },
    '--edu--adobecom.aem.page': {
      'www.adobe.com(?!\\/*\\S*\\/(mini-plans|plans-fragments\\/modals|genuine(\\.html)?\\/?)\\S*)': 'origin',
      'business.adobe.com': 'business.stage.adobe.com',
      'helpx.adobe.com': 'helpx.stage.adobe.com',
      'blog.adobe.com': 'blog.stage.adobe.com',
      'developer.adobe.com': 'developer-stage.adobe.com',
      'news.adobe.com': 'news.stage.adobe.com',
      'firefly.adobe.com': 'firefly-stage.corp.adobe.com',
      'creativecloud.adobe.com': 'stage.creativecloud.adobe.com',
      'projectneo.adobe.com': 'stg.projectneo.adobe.com',
    },
    '.graybox.adobe.com': { 'www.adobe.com(?!\\/*\\S*\\/(mini-plans|plans-fragments\\/modals|genuine(\\.html)?\\/?)\\S*)': 'origin' },
  },
  uniqueSiteId: 'edu',
  mepLingoCountryToRegion: {
    africa: ['ke', 'mu', 'ng', 'za'],
    la: ['bo', 'cr', 'do', 'ec', 'gt', 'pa', 'pr', 'py', 'sv', 'uy', 've'],
    mena_en: ['bh', 'dz', 'iq', 'ir', 'jo', 'lb', 'ly', 'om', 'ps', 'sy', 'tn', 'ye'],
  },
};



const { prefix } = getLocale(CONFIG.locales);

function replaceDotMedia(area = document) {
  // eslint-disable-next-line compat/compat
  const currUrl = new URL(window.location);
  const pathSeg = currUrl.pathname.split('/').length;
  if ((prefix === '' && pathSeg >= 3) || (prefix !== '' && pathSeg >= 4)) return;
  const resetAttributeBase = (tag, attr) => {
    area.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((el) => {
      // eslint-disable-next-line compat/compat
      el[attr] = `${new URL(`${CONFIG.contentRoot}${el.getAttribute(attr).substring(1)}`, window.location).href}`;
    });
  };
  resetAttributeBase('img', 'src');
  resetAttributeBase('source', 'srcset');
}

replaceDotMedia(document);

/*
 * ------------------------------------------------------------
 * Edit below at your own risk
 * ------------------------------------------------------------
 */

const miloLibs = setLibs(LIBS);

function overrideConsonantTypography() {
  document.documentElement.setAttribute('data-edu-typography-override', 'on');
}

(function loadStyles() {
  const paths = [`${miloLibs}/styles/styles.css`];
  if (STYLES) { paths.push(STYLES); }
  paths.forEach((path) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', path);
    document.head.appendChild(link);
  });
}());

async function loadPage() {
  const { loadArea, setConfig, loadLana, getMetadata } = await import(`${miloLibs}/utils/utils.js`);
  if (getMetadata('edu-typography-override') === 'on') {
    overrideConsonantTypography();
  }
  // eslint-disable-next-line no-unused-vars
  const config = setConfig({ ...CONFIG, miloLibs });
  decorateArea();
  loadLana({ clientId: 'education' });
  await loadArea();
}

loadPage();

(async function loadDa() {
  if (!new URL(window.location.href).searchParams.get('dapreview')) return;
  // eslint-disable-next-line import/no-unresolved
  import('https://da.live/scripts/dapreview.js').then(({ default: daPreview }) => daPreview(loadPage));
}());
