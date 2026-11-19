customElements.define('sp-progress-circle', class extends HTMLElement {
  get updateComplete() {
    return Promise.resolve(this);
  }
});
