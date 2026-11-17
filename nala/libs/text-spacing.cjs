const { expect } = require('@playwright/test');

async function applyTextSpacing(page, text) {
  await page.addStyleTag({
    content: `
      * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      p { margin-block-end: 2em !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready);

  await expect(async () => {
    const metrics = await text.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      const fontSize = parseFloat(style.fontSize);
      return {
        text: element.textContent.trim(),
        lineHeight: parseFloat(style.lineHeight) / fontSize,
        letterSpacing: parseFloat(style.letterSpacing) / fontSize,
        wordSpacing: parseFloat(style.wordSpacing) / fontSize,
        paragraphSpacing: element.tagName === 'P'
          ? parseFloat(style.marginBlockEnd) / fontSize : null,
      };
    }));
    expect(metrics.length, 'Text-spacing checks must exercise at least one text element').toBeGreaterThan(0);
    metrics.forEach((metric) => {
      expect(metric.lineHeight, metric.text).toBeCloseTo(1.5, 2);
      expect(metric.letterSpacing, metric.text).toBeCloseTo(0.12, 2);
      expect(metric.wordSpacing, metric.text).toBeCloseTo(0.16, 2);
      if (metric.paragraphSpacing !== null) {
        expect(metric.paragraphSpacing, metric.text).toBeCloseTo(2, 2);
      }
    });
  }).toPass({ timeout: 5000 });
}

async function expectTextNotClipped(text) {
  expect(await text.count(), 'Clipping checks must exercise at least one text element').toBeGreaterThan(0);
  const clipped = await text.evaluateAll((elements) => elements.flatMap((element) => {
    const failures = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rectangles = [...range.getClientRects()];
        const style = getComputedStyle(node.parentElement);
        if (!rectangles.length || style.visibility !== 'visible') {
          failures.push({ text: node.textContent.trim(), reason: 'Text is hidden' });
        } else {
          let ancestor = node.parentElement;
          while (ancestor) {
            const ancestorStyle = getComputedStyle(ancestor);
            const clipX = ['hidden', 'clip'].includes(ancestorStyle.overflowX);
            const clipY = ['hidden', 'clip'].includes(ancestorStyle.overflowY);
            if (clipX || clipY) {
              const box = ancestor.getBoundingClientRect();
              const left = box.left + ancestor.clientLeft;
              const top = box.top + ancestor.clientTop;
              const right = left + ancestor.clientWidth;
              const bottom = top + ancestor.clientHeight;
              // Allow one CSS pixel for fractional font/layout rounding.
              if (rectangles.some((rect) => (
                (clipX && (rect.left < left - 1 || rect.right > right + 1))
                || (clipY && (rect.top < top - 1 || rect.bottom > bottom + 1))
              ))) {
                failures.push({ text: node.textContent.trim(), ancestor: ancestor.className || ancestor.tagName });
                break;
              }
            }
            ancestor = ancestor.parentElement;
          }
        }
      }
      node = walker.nextNode();
    }
    return failures;
  }));
  expect(clipped, 'Text must not be hidden or clipped by an overflow container').toEqual([]);
}

module.exports = { applyTextSpacing, expectTextNotClipped };
