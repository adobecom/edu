import { expect, test } from '@playwright/test';
import BaseReporter from './base-reporter.cjs';

function testCase(outcome, statuses, expectedStatus = 'passed') {
  return {
    title: '@reporter @nopr',
    expectedStatus,
    parent: { project: () => ({ name: 'edu-live-chromium' }) },
    outcome: () => outcome,
    results: statuses.map((status, retry) => ({
      status,
      retry,
      duration: 1,
      stdout: [],
      stderr: [],
      ...(status !== 'passed' ? { error: { message: `Attempt ${retry}: ${status}` } } : {}),
    })),
  };
}

async function report(tests) {
  const reporter = new BaseReporter();
  reporter.onBegin({
    projects: [{
      name: 'edu-live-chromium',
      use: {
        baseURL: 'https://stage--edu--adobecom.aem.live',
        defaultBrowserType: 'chromium',
      },
    }],
  }, { allTests: () => tests });
  await reporter.onEnd();
  return reporter;
}

test.describe('Base reporter final outcomes @nopr', () => {
  test('collects plain test titles alongside legacy tagged titles', async () => {
    const plain = testCase('unexpected', ['failed']);
    plain.title = 'keeps the form usable when the indicator fails to load';
    const tagged = testCase('expected', ['passed']);
    tagged.title = '@demo-basic @demo @smoke';
    const reporter = await report([plain, tagged]);

    expect(reporter.results[0]).toMatchObject({ name: plain.title, tags: [], status: 'failed' });
    expect(reporter.results[1]).toMatchObject({ name: 'demo-basic', tags: ['demo', 'smoke'], status: 'passed' });
    expect(reporter.failedTests).toBe(1);
    expect(reporter.passedTests).toBe(1);
  });

  test('reports five expected and one flaky test without counting retries as passes', async () => {
    const tests = Array.from({ length: 5 }, () => testCase('expected', ['passed']));
    tests.push(testCase('flaky', ['failed', 'passed']));
    const reporter = await report(tests);

    expect(reporter.results).toHaveLength(6);
    expect(reporter.passedTests).toBe(5);
    expect(reporter.flakyTests).toBe(1);
    expect(reporter.failedTests).toBe(0);
    expect(reporter.printResultSummary()).toContain('# Test Flaky');
    expect(reporter.results[5]).toMatchObject({ outcome: 'flaky', status: 'flaky', retry: 1 });
  });

  test('counts terminal failures once and respects expected failures and skipped tests', async () => {
    const reporter = await report([
      testCase('unexpected', ['failed', 'failed']),
      testCase('unexpected', ['timedOut', 'timedOut']),
      testCase('expected', ['failed'], 'failed'),
      testCase('unexpected', ['passed'], 'failed'),
      testCase('skipped', ['skipped'], 'skipped'),
    ]);

    expect(reporter.results).toHaveLength(5);
    expect(reporter.failedTests).toBe(3);
    expect(reporter.passedTests).toBe(1);
    expect(reporter.skippedTests).toBe(1);
    expect(reporter.flakyTests).toBe(0);
    expect(reporter.results[0].errorMessage).toBe('Attempt 1: failed');
    expect(reporter.results[2]).toMatchObject({ status: 'passed', expectedStatus: 'failed', finalAttemptStatus: 'failed' });
  });

  test('does not duplicate intermediate timeouts or multiple retries', async () => {
    const reporter = await report([
      testCase('flaky', ['timedOut', 'passed']),
      testCase('flaky', ['failed', 'timedOut', 'passed']),
      testCase('skipped', []),
    ]);

    expect(reporter.results).toHaveLength(3);
    expect(reporter.flakyTests).toBe(2);
    expect(reporter.passedTests).toBe(0);
    expect(reporter.failedTests).toBe(0);
    expect(reporter.skippedTests).toBe(1);
  });
});
