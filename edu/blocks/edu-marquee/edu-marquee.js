let decorateBlockBg;

export default async function init(block) {
  ({ decorateBlockBg } = await import(`${libs}/utils/decorate.js`));

  let rows = block.querySelectorAll(':scope > div');
  if (rows.length > 1) {
    const [videoRow, textRow] = rows;

    block.classList.add('has-bg');
    decorateBlockBg(block, videoRow);

    if (textRow) {
      textRow.classList.add('text-container');
      const textCols = textRow?.children;
      if (textCols && textCols.length > 1) {
        textCols[0].classList.add('mobile-only');
        textCols[1].classList.add('tablet-only', 'desktop-only');
      }
    }
  }
}
