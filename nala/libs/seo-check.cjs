import { expect } from '@playwright/test';

export async function runSeoChecks({ page, feature, options = {} }) {
  const issues = [];
  const config = {
    minTitleLength: options.minTitleLength ?? 15,
    maxTitleLength: options.maxTitleLength ?? 65,
  };

  // Ensure at least one heading
  const headings = page.locator('h1,h2,h3,h4,h5,h6');
  try {
    await expect(headings.first()).toBeVisible();
  } catch {
    issues.push('No visible heading found (h1–h6)');
  }

  // Page title
  const title = await page.title();
  if (!title || title.trim().length === 0) {
    issues.push('Missing or empty <title>');
  } else {
    if (title.length < config.minTitleLength) {
      issues.push(`<title> too short (${title.length} chars, min ${config.minTitleLength})`);
    }
    if (title.length > config.maxTitleLength) {
      issues.push(`<title> too long (${title.length} chars, max ${config.maxTitleLength})`);
    }
  }

  // Meta description
  /*
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  if (!description) {
    issues.push('Missing meta description');
  }
  * */
  // Canonical link
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  if (!canonical) {
    issues.push('Missing canonical link');
  }

  // Images should have alt attribute
  const images = page.locator('img');
  const count = await images.count();
  for (let i = 0; i < count; i++) {
    const alt = await images.nth(i).getAttribute('alt');
    if (alt === null) {
      issues.push(`Image ${i} is missing alt attribute`);
    }
  }

  // === Print Summary ===
  if (issues.length === 0) {
    console.info(`[SEO Test]: No SEO issues found for [Test Id - ${feature.tcid}] ${feature.name}.`);
  } else {
    console.warn(`[SEO Test]: Issues found for [Test Id - ${feature.tcid}] ${feature.name}.`);
    issues.forEach((msg) => console.warn(` - ${msg}`));
  }
}
