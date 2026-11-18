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

### Nala end-to-end tests

Run the demo against stage, including repeated runs in all three desktop browsers:

```sh
LOCAL_TEST_LIVE_URL=https://stage--edu--adobecom.aem.live npx playwright test nala/blocks/demo/demo.test.cjs --project=edu-live-chromium --project=edu-live-firefox --project=edu-live-webkit --repeat-each=5
```

The demo fixture uses the configured base URL and checks the main demo heading.
Demo and media tests resolve their paths against that URL, with or without a
trailing slash.

The entitlement-check integration tests always use the local checkout. Playwright
starts and stops a loopback-only Web Dev Server on port 2001 automatically; keep
that port available. The tests proxy real Milo libraries and mock eligibility
responses and destination navigation. No AEM publishing of `test/` is required;
it remains excluded by `.hlxignore`.
Responsive checks assert spacing, alignment, containment, and layout stability
without assuming identical system-font wrapping across operating systems. Native
email inputs allow a one-pixel browser rendering difference.

Run the suite against a branch (Chromium by default):

```sh
npm run nala <branch>
```

Published-page tests use the selected branch URL; entitlement fixtures use the
local server regardless of that URL.

CI retains one retry and succeeds when a test recovers. The custom summary counts
each final test once and reports flaky tests separately from expected passes,
unexpected failures, and skips; the built-in list/GitHub reporters remain enabled.
Failed CI runs retain Playwright traces and error contexts in the
`nala-test-results` artifact for seven days.
Reporter regression tests are tagged `@nopr` to keep synthetic summaries out of
the live PR suite. Run them explicitly:

```sh
npx playwright test nala/utils/base-reporter.test.cjs --project=edu-live-chromium --reporter=list
```

## Security
1. Create a Service Now ID for your project via [Service Registry Portal](https://adobe.service-now.com/service_registry_portal.do#/search)
2. Update the `.kodiak/config.yaml` file to make sure valid team members are assigned security vulnerability Jira tickets.
