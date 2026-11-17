async function pressTab(page, reverse = false) {
  const browserName = page.context().browser().browserType().name();
  // macOS WebKit requires Option+Tab to include links in native keyboard traversal.
  const modifier = process.platform === 'darwin' && browserName === 'webkit' ? 'Alt+' : '';
  await page.keyboard.press(`${modifier}${reverse ? 'Shift+' : ''}Tab`);
}

module.exports = { pressTab };
