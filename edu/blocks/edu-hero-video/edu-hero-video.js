let decorateBlockBg;

export default async function init(block) {
  ({ decorateBlockBg } = await import(`${libs}/utils/decorate.js`));

  let rows = block.querySelectorAll(':scope > div');
  if (rows.length > 0) {
    block.classList.add('has-bg');
    decorateBlockBg(block, rows[0]);
  }
}
