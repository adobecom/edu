# Milo goes to college
Use this project template to create a Milo site.

## Steps

1. Copy existing [`college`](https://adobe.sharepoint.com/:f:/r/sites/adobecom/Shared%20Documents/demos/college) content folder to your sharepoint and give helix@adobe.com View access
2. Click "[Use this template](https://github.com/adobecom/milo-college/generate)" Github button on this project.
3. Install the [AEM Code Sync Bot](https://github.com/apps/aem-code-sync)

From your newly created project

1. Install the [Helix Bot](https://github.com/apps/helix-bot/installations/new).
2. Change the fstab.yaml file to point to your content.
3. Add the project to the [Helix Sidekick](https://github.com/adobe/helix-sidekick).
4. Start creating your content.

## Developing
1. Install the [Helix CLI](https://github.com/adobe/helix-cli): `sudo npm install -g @adobe/aem-cli`
1. Run `aem up` this repo's folder. (opens your browser at `http://localhost:3000`)
1. Open this repo's folder in your favorite editor and start coding.

## Testing
```sh
npm run test
```
or:
```sh
npm run test:watch
```
This will give you several options to debug tests. Note: coverage may not be accurate.

### Automated accessibility regression tests (Nala)

After `npm ci` and `npx playwright install`, run the automated accessibility subset:

```sh
LOCAL_TEST_LIVE_URL=https://main--edu--adobecom.aem.live npx playwright test --grep @a11y --project=edu-live-chromium --project=edu-live-firefox --project=edu-live-webkit
```

Set `LOCAL_TEST_LIVE_URL` to your preview origin to test published changes. These
tests are also discovered by the existing Nala PR workflow's desktop browser
projects. A PR label filter must include `@a11y` to select this entire subset.
On macOS WebKit, keyboard tests use Option+Tab (and Option+Shift+Tab) so native
traversal includes links without altering the DOM's focus order.

| Coverage | Automated assertions |
| --- | --- |
| Media block on `/drafts/nala/demo/demo-page` | Expected accessible headings/link names (including Milo's heading-context enhancement), bounded keyboard reachability, forward/reverse Tab order within the block, Enter navigation, and axe checks |
| Local prompt-card group fixture | Production component JS/CSS, named buttons, forward/reverse Tab order into/out of cards, Enter/Space activation, focus retention, and live-region DOM updates including repeated actions |
| Text spacing on both components | At 1280px and 375px widths: apply and verify line height 1.5, paragraph spacing 2em (where paragraphs exist), letter spacing 0.12em, and word spacing 0.16em; check text against clipping ancestors, page horizontal overflow, and keyboard functionality |

Prompt-card tests route local repository files without a server; only external
Milo tag/tracking helpers and the OS clipboard are stubbed. They do not test the
full Milo integration or system clipboard. Run just these offline component tests
with `npx playwright test nala/blocks/prompt-card --project=edu-live-chromium`.
The media tests require the published demo page and its current expected content.

Each axe scan attaches its full JSON results, including `incomplete` checks needing
manual review, to the Playwright report. Spacing tests attach screenshots for
review; these are evidence, not automatically approved visual baselines. Spacing
overrides remain active for the rest of each isolated test page.
The existing PR workflow uploads the HTML report and test outputs as the
`nala-results` artifact, even after failures, with a 14-day retention period.

This is representative regression coverage, **not WCAG conformance certification
or actual screen-reader testing**. Accessible-name/state assertions and live-region
DOM checks do not verify spoken announcements. The clipping heuristic does not
prove the absence of overlap, obscured focus, or all possible layout failures.
Dialogs, global navigation, forms, other component variants/locales, real
screen-reader/browser combinations, and human usability assessment remain outside
this initial subset. The URL-input workflow and PR-comment bot are separate work.

## Security
1. Create a Service Now ID for your project via [Service Registry Portal](https://adobe.service-now.com/service_registry_portal.do#/search)
2. Update the `.kodiak/config.yaml` file to make sure valid team members are assigned security vulnerability Jira tickets.
