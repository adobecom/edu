class MediaBlock {
  constructor(page, selector = '.media', nth = 0) {
    this.page = page;
    this.block = page.locator(selector).nth(nth);
  }
}
module.exports = MediaBlock;
