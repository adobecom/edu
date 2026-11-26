/* eslint-env node */
import { createSign } from 'node:crypto';

export function validateConfiguration(env) {
  const minimums = {
    EXPRESS_MERGE_APP_ID: 1,
    REQUIRED_APPROVALS: 1,
    MAX_PRS_PER_BATCH: 1,
    STAGE_RCP_OFFSET_DAYS: 0,
    MAIN_RCP_OFFSET_DAYS: 0,
  };
  Object.entries(minimums).forEach(([name, minimum]) => {
    const value = env[name];
    if (!value || !/^\d+$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
      throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
    }
  });
  if (!env.EXPRESS_MERGE_PRIVATE_KEY?.trim()) {
    throw new Error('EXPRESS_MERGE_PRIVATE_KEY is missing.');
  }
}

export async function verifyInstallation({ github, context, core, env }) {
  const { owner, repo } = context.repo;
  if (owner !== 'adobecom' || repo !== 'edu') {
    throw new Error('This verification is restricted to adobecom/edu.');
  }

  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = [
    encode({ alg: 'RS256', typ: 'JWT' }),
    encode({ iat: now - 60, exp: now + 300, iss: env.EXPRESS_MERGE_APP_ID }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(payload)
    .sign(env.EXPRESS_MERGE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'base64url');
  const jwt = `${payload}.${signature}`;
  core.setSecret(jwt);

  const { data: installation } = await github.request(
    'GET /app/installations/{installation_id}',
    {
      installation_id: env.INSTALLATION_ID,
      headers: { authorization: `Bearer ${jwt}` },
    },
  );
  if (installation.app_id !== Number(env.EXPRESS_MERGE_APP_ID)
    || installation.suspended_at) {
    throw new Error('The installation must belong to the configured App and not be suspended.');
  }
  ['contents', 'pull_requests', 'issues'].forEach((permission) => {
    if (installation.permissions[permission] !== 'write') {
      throw new Error(`The App installation requires ${permission}: write for the merge scripts.`);
    }
  });
  if (!['read', 'write'].includes(installation.permissions.checks)) {
    throw new Error('The App installation requires checks: read or write.');
  }

  const { data: repository } = await github.rest.repos.get({ owner, repo });
  if (!repository.allow_squash_merge || !repository.allow_merge_commit) {
    throw new Error('EDU must enable squash merging to stage and merge commits to main.');
  }
  await github.rest.issues.listLabelsForRepo({ owner, repo, per_page: 1 });
  await Promise.all(['stage', 'main'].map(async (branch) => {
    const { data } = await github.rest.repos.getBranch({ owner, repo, branch });
    await github.rest.pulls.list({ owner, repo, state: 'open', base: branch, per_page: 1 });
    await github.rest.checks.listForRef({ owner, repo, ref: data.commit.sha, per_page: 1 });
  }));
}
