#!/usr/bin/env node
// Downloads TestFlight tester feedback (screenshot feedback + crash reports) for
// one app through the App Store Connect API. Used by
// .github/workflows/testflight-feedback.yml. Node 18+, no dependencies.
//
//   node testflight-feedback.mjs <bundle id> <days> <out dir>
//
// Writes a Markdown report to the job summary, and into <out dir>:
//   feedback.json, screenshots/<id>-<n>.png, crash-logs/<id>.txt
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY (contents of the .p8 key).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [bundleId, daysArg, outDir] = process.argv.slice(2);
const API = 'https://api.appstoreconnect.apple.com';

if (!bundleId || !daysArg || !outDir) fail('usage: testflight-feedback.mjs <bundle id> <days> <out dir>');
const days = Number(daysArg);
if (!Number.isFinite(days) || days <= 0) fail(`days must be a positive number, got "${daysArg}"`);
for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY']) {
  if (!process.env[name]) fail(`Missing ${name} — add it under GitHub → Settings → Secrets and variables → Actions.`);
}
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function summary(line = '') {
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

async function api(urlPath) {
  const res = await fetch(urlPath.startsWith('http') ? urlPath : `${API}${urlPath}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => `${e.title}: ${e.detail}`).join('; ') || res.statusText;
    fail(`App Store Connect ${res.status} on ${urlPath}: ${detail}`);
  }
  return json;
}

// Newest first; stops paging once a page reaches past the time window.
async function recent(urlPath) {
  const data = [];
  const included = [];
  for (let next = urlPath; next; ) {
    const page = await api(next);
    included.push(...(page.included || []));
    const fresh = page.data.filter((d) => new Date(d.attributes.createdDate) >= since);
    data.push(...fresh);
    next = fresh.length === page.data.length ? page.links?.next : null;
  }
  return { data, included };
}

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
const app = apps.data.find((a) => a.attributes.bundleId === bundleId);
if (!app) fail(`No App Store Connect app with bundle id ${bundleId} visible to this API key.`);
const appName = app.attributes.name;

const query = 'include=build,tester&fields[builds]=version&fields[betaTesters]=firstName,lastName,email&sort=-createdDate&limit=200';
const screenshots = await recent(`/v1/apps/${app.id}/betaFeedbackScreenshotSubmissions?${query}`);
const crashes = await recent(`/v1/apps/${app.id}/betaFeedbackCrashSubmissions?${query}`);
const included = [...screenshots.included, ...crashes.included];
const lookup = (rel) => rel?.data && included.find((i) => i.type === rel.data.type && i.id === rel.data.id);

fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'crash-logs'), { recursive: true });

const items = [];
for (const [kind, list] of [['screenshot', screenshots.data], ['crash', crashes.data]]) {
  for (const s of list) {
    const a = s.attributes;
    const build = lookup(s.relationships?.build);
    const tester = lookup(s.relationships?.tester);
    const testerName = tester
      ? [tester.attributes.firstName, tester.attributes.lastName].filter(Boolean).join(' ') || tester.attributes.email
      : a.email;
    const item = {
      kind,
      id: s.id,
      createdDate: a.createdDate,
      tester: testerName || 'Anonymous',
      email: a.email || tester?.attributes.email || null,
      build: build?.attributes.version || null,
      comment: a.comment || '',
      device: a.deviceModel,
      os: a.osVersion,
      locale: a.locale,
      connection: a.connectionType,
      battery: a.batteryPercentage,
      files: [],
    };

    if (kind === 'screenshot') {
      for (const [n, shot] of (a.screenshots || []).entries()) {
        // Signed URLs expire, so keep a copy with the run's artifact.
        const file = path.join('screenshots', `${s.id}-${n + 1}.png`);
        const res = await fetch(shot.url);
        if (res.ok) {
          fs.writeFileSync(path.join(outDir, file), Buffer.from(await res.arrayBuffer()));
          item.files.push(file);
        } else {
          console.log(`::warning::Could not download screenshot ${n + 1} of ${s.id} (${res.status})`);
        }
      }
    } else {
      const log = await api(`/v1/betaFeedbackCrashSubmissions/${s.id}/crashLog`);
      const file = path.join('crash-logs', `${s.id}.txt`);
      fs.writeFileSync(path.join(outDir, file), log.data?.attributes?.logText || '');
      item.files.push(file);
    }
    items.push(item);
  }
}

items.sort((x, y) => y.createdDate.localeCompare(x.createdDate));
fs.writeFileSync(path.join(outDir, 'feedback.json'), JSON.stringify({ app: appName, bundleId, since, items }, null, 2));

const crashCount = items.filter((i) => i.kind === 'crash').length;
summary(`## ${appName} (\`${bundleId}\`) — TestFlight feedback, last ${days} days`);
summary(`${items.length - crashCount} screenshot feedback, ${crashCount} crash reports.`);
summary();
if (!items.length) {
  summary('_No feedback in this window._');
  process.exit(0);
}
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
summary('| When (UTC) | Type | Build | Tester | Device / iOS | Comment |');
summary('|---|---|---|---|---|---|');
for (const i of items) {
  summary(
    `| ${i.createdDate.slice(0, 16).replace('T', ' ')} | ${i.kind === 'crash' ? '💥 crash' : '📷 feedback'} | ${cell(i.build ?? '?')} ` +
      `| ${cell(i.tester)} | ${cell(i.device)} / ${cell(i.os)} | ${cell(i.comment) || '—'} |`,
  );
}
summary();
summary(`Screenshots, crash logs and the full JSON are in this run's **testflight-feedback-${bundleId}** artifact.`);
