/* eslint-env node */
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { validateConfiguration, verifyInstallation } from './verify-merge-setup.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  EXPRESS_MERGE_APP_ID: '123',
  EXPRESS_MERGE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  REQUIRED_APPROVALS: '2',
  MAX_PRS_PER_BATCH: '8',
  STAGE_RCP_OFFSET_DAYS: '0',
  MAIN_RCP_OFFSET_DAYS: '2',
  INSTALLATION_ID: '456',
};

test('configuration rejects missing, unsafe, fractional, and negative settings without echoing values', () => {
  validateConfiguration(env);
  Object.keys(env).filter((name) => name !== 'INSTALLATION_ID').forEach((name) => {
    assert.throws(() => validateConfiguration({ ...env, [name]: '' }), new RegExp(name));
  });
  ['-1', '1.5', 'NaN', '9007199254740992', 'secret-value'].forEach((value) => {
    assert.throws(() => validateConfiguration({ ...env, MAX_PRS_PER_BATCH: value }), (error) => (
      error.message.includes('MAX_PRS_PER_BATCH') && !error.message.includes(value)
    ));
  });
  assert.throws(() => validateConfiguration({ ...env, REQUIRED_APPROVALS: '0' }));
  assert.throws(() => validateConfiguration({ ...env, EXPRESS_MERGE_PRIVATE_KEY: '   ' }));
});

function fixture(overrides = {}) {
  const calls = [];
  let maskedToken;
  const read = (name, data) => async (params) => {
    calls.push({ name, params });
    return { data };
  };
  const permissions = { contents: 'write', pull_requests: 'write', issues: 'write', checks: 'read' };
  const installation = { app_id: 123, suspended_at: null, permissions, ...overrides.installation };
  const github = {
    request: async (route, params) => {
      assert.equal(route, 'GET /app/installations/{installation_id}');
      assert.equal(params.installation_id, env.INSTALLATION_ID);
      assert.equal(params.headers.authorization, `Bearer ${maskedToken}`);
      const [header, payload, signature] = maskedToken.split('.');
      assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`),
        publicKey, Buffer.from(signature, 'base64url')));
      calls.push({ name: route });
      return { data: installation };
    },
    rest: {
      repos: {
        get: read('repos.get', { allow_squash_merge: true, allow_merge_commit: true,
          ...overrides.repository }),
        getBranch: read('repos.getBranch', { commit: { sha: 'test-sha' } }),
      },
      issues: { listLabelsForRepo: read('issues.listLabelsForRepo', []) },
      pulls: { list: read('pulls.list', []) },
      checks: { listForRef: read('checks.listForRef', {}) },
    },
  };
  return {
    calls,
    params: {
      github,
      context: { repo: { owner: 'adobecom', repo: 'edu' } },
      core: { setSecret: (token) => { maskedToken = token; } },
      env,
    },
  };
}

test('verification masks a signed App JWT and uses only read APIs for both branches', async () => {
  const { params, calls } = fixture();
  await verifyInstallation(params);
  assert.equal(calls.length, 9);
  assert.deepEqual(calls.filter(({ name }) => name === 'repos.getBranch')
    .map(({ params: { branch } }) => branch).sort(), ['main', 'stage']);
  assert.deepEqual(calls.filter(({ name }) => name === 'pulls.list')
    .map(({ params: { base } }) => base).sort(), ['main', 'stage']);
});

test('verification rejects invalid credentials, permissions, suspension, and merge settings', async () => {
  const cases = [
    { installation: { app_id: 999 } },
    { installation: { suspended_at: '2026-11-25T00:00:00Z' } },
    ...['contents', 'pull_requests', 'issues', 'checks'].map((permission) => ({
      installation: { permissions: {
        contents: 'write', pull_requests: 'write', issues: 'write', checks: 'read',
        [permission]: 'none',
      } },
    })),
    { repository: { allow_squash_merge: false } },
    { repository: { allow_merge_commit: false } },
  ];
  await Promise.all(cases.map(async (overrides) => {
    await assert.rejects(verifyInstallation(fixture(overrides).params));
  }));
  const { params } = fixture();
  await assert.rejects(verifyInstallation({
    ...params, env: { ...env, EXPRESS_MERGE_PRIVATE_KEY: 'invalid key' },
  }));
});

test('verification fails on denied read access rather than reporting success', async () => {
  const { params } = fixture();
  params.github.rest.repos.getBranch = async () => { throw new Error('Access denied'); };
  await assert.rejects(verifyInstallation(params), /Access denied/);
});
