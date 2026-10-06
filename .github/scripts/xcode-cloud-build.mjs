#!/usr/bin/env node
// Starts an Xcode Cloud build through the App Store Connect API and (optionally)
// waits for it to finish. Used by .github/workflows/ios-xcode-cloud.yml; setup in
// docs/XCODE_CLOUD_SETUP.md. Node 18+, no dependencies.
//
//   node xcode-cloud-build.mjs <bundle id> <branch> [--wait]
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (contents of the .p8 key),
//      XCODE_CLOUD_WORKFLOW (workflow name, default "TestFlight").
import crypto from 'node:crypto';
import fs from 'node:fs';

const [bundleId, branch, ...flags] = process.argv.slice(2);
const wait = flags.includes('--wait');
const workflowName = process.env.XCODE_CLOUD_WORKFLOW || 'TestFlight';
const API = 'https://api.appstoreconnect.apple.com';

if (!bundleId || !branch) fail('usage: xcode-cloud-build.mjs <bundle id> <branch> [--wait]');
for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY']) {
  if (!process.env[name]) fail(`Missing ${name} — add it under GitHub → Settings → Secrets and variables → Actions.`);
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function summary(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

// App Store Connect wants a short-lived ES256 JWT signed with the API key.
function token() {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' })}.${b64({
    iss: process.env.ASC_ISSUER_ID,
    iat: now,
    exp: now + 15 * 60,
    aud: 'appstoreconnect-v1',
  })}`;
  const key = process.env.ASC_PRIVATE_KEY.replace(/\\n/g, '\n');
  const signature = crypto.sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' });
  return `${body}.${signature.toString('base64url')}`;
}

async function api(path, options = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...options.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => `${e.title}: ${e.detail}`).join('; ') || res.statusText;
    fail(`App Store Connect ${res.status} on ${path}: ${detail}`);
  }
  return json;
}

// Follows `links.next` so long lists (git branches) are read in full.
async function all(path) {
  const data = [];
  const included = [];
  for (let next = path; next; ) {
    const page = await api(next);
    data.push(...page.data);
    included.push(...(page.included || []));
    next = page.links?.next;
  }
  return { data, included };
}

// 1. The Xcode Cloud product for this app.
const products = await all('/v1/ciProducts?include=app&limit=200');
const app = products.included.find((i) => i.type === 'apps' && i.attributes.bundleId === bundleId);
const product = app && products.data.find((p) => p.relationships?.app?.data?.id === app.id);
if (!product) fail(`No Xcode Cloud product for ${bundleId}. Create its workflow in Xcode first (docs/XCODE_CLOUD_SETUP.md).`);

// 2. The workflow, by name.
const workflows = await all(`/v1/ciProducts/${product.id}/workflows?limit=200`);
const workflow = workflows.data.find((w) => w.attributes.name === workflowName);
if (!workflow) {
  const names = workflows.data.map((w) => `"${w.attributes.name}"`).join(', ') || 'none';
  fail(`${bundleId} has no Xcode Cloud workflow named "${workflowName}" (found: ${names}).`);
}
if (workflow.attributes.isEnabled === false) fail(`Workflow "${workflowName}" is disabled in App Store Connect.`);

// 3. The branch, as Xcode Cloud knows it.
const repo = await api(`/v1/ciWorkflows/${workflow.id}/repository`);
const refs = await all(`/v1/scmRepositories/${repo.data.id}/gitReferences?limit=200`);
const ref = refs.data.find((r) => r.attributes.kind === 'BRANCH' && r.attributes.name === branch && !r.attributes.isDeleted);
if (!ref) fail(`Xcode Cloud can't see branch "${branch}" — is it pushed to GitHub?`);

// 4. Start the build.
const run = await api('/v1/ciBuildRuns', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      type: 'ciBuildRuns',
      relationships: {
        workflow: { data: { type: 'ciWorkflows', id: workflow.id } },
        sourceBranchOrTag: { data: { type: 'scmGitReferences', id: ref.id } },
      },
    },
  }),
});
summary(`### ${app.attributes.name} — Xcode Cloud build ${run.data.attributes.number} started`);
summary(`Workflow **${workflowName}**, branch \`${branch}\`. Follow it in App Store Connect → Apps → ${app.attributes.name} → Xcode Cloud.`);
if (!wait) process.exit(0);

// 5. Wait for it.
let attributes = run.data.attributes;
while (attributes.executionProgress !== 'COMPLETE') {
  await new Promise((r) => setTimeout(r, 60_000));
  attributes = (await api(`/v1/ciBuildRuns/${run.data.id}`)).data.attributes;
  console.log(`${new Date().toISOString().slice(11, 16)} ${attributes.executionProgress}`);
}

const actions = await api(`/v1/ciBuildRuns/${run.data.id}/actions`);
for (const a of actions.data) {
  const issues = a.attributes.issueCounts || {};
  summary(`- ${a.attributes.name}: **${a.attributes.completionStatus}** (errors ${issues.errors ?? 0}, warnings ${issues.warnings ?? 0})`);
}
if (attributes.completionStatus !== 'SUCCEEDED') {
  fail(`Build ${attributes.number} ${attributes.completionStatus}. Logs: App Store Connect → ${app.attributes.name} → Xcode Cloud → build ${attributes.number}.`);
}
summary(`✅ Build ${attributes.number} succeeded — it reaches TestFlight once Apple has processed it (~10–30 min).`);
