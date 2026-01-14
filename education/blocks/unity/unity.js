function getUnityLibs(prodLibs = '/unitylibs') {
    const { hostname } = window.location;
    if (!hostname.includes('hlx.page')
          && !hostname.includes('hlx.live')
          && !hostname.includes('aem.page')
          && !hostname.includes('aem.live')
          && !hostname.includes('localhost')) {
      return prodLibs;
    }
    const branch = new URLSearchParams(window.location.search).get('unitylibs') || 'main';
    const env = hostname.includes('.hlx.') ? 'hlx' : 'aem';
    if (branch.indexOf('--') > -1) return `https://${branch}.${env}.live/unitylibs`;
    return `https://${branch}--unity--adobecom.${env}.live/unitylibs`;
  }
  
  export default async function init(el) {
    const unitylibs = getUnityLibs();
    const promiseArr = [
      `${unitylibs}/core/styles/styles.css`,
      `${unitylibs}/scripts/utils.js`,
      `${unitylibs}/core/workflow/workflow.js`,
    ];
    const { default: wfinit } = await import(`${unitylibs}/core/workflow/workflow.js`);
    await wfinit(el, 'education', unitylibs, 'v2');
  }
  