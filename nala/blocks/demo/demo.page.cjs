export default class DemoBlock {
  constructor(page) {
    this.page = page;
    this.header = this.page.locator('main h1#nala-demo-test');
  }
}
