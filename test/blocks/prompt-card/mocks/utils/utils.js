// eslint-disable-next-line import/prefer-default-export
export function createTag(tag, attributes, content) {
  const element = document.createElement(tag);
  Object.entries(attributes || {}).forEach(([name, value]) => element.setAttribute(name, value));
  if (content !== undefined) element.innerHTML = content;
  return element;
}
