#!/usr/bin/env node
/**
 * Times the requests behind the operator app's Home, Notifications and Trips
 * screens: how long each takes and how much it downloads (compressed, as the
 * phone receives it). Read-only — it only sends GET requests after logging in.
 *
 *   node scripts/measure-operator-speed.mjs https://mercon.tech/api
 *   node scripts/measure-operator-speed.mjs https://dev.mercon.tech/api
 *
 * Asks for the username and password in the terminal; nothing is saved.
 * Needs Node 18+ (built-in fetch).
 */
import readline from 'node:readline';

const API = (process.argv[2] || 'https://mercon.tech/api').replace(/\/$/, '');

function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
  return new Promise((res) => rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); res(a); }));
}

const startOfTodayIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const days = (n) => new Date(Date.now() + n * 86400000).toISOString();

const SCREENS = {
  'Home + Notifications (To do)': [
    ['live map (every 30 s)', '/vehicles/live-map'],
    ['upcoming trips', '/trips?status=Draft,Scheduled&per_page=100'],
    ['driver updates', '/operator-inbox/driver-updates'],
    ['document expiries', '/operator-inbox/document-expiries'],
    ['docs to review', '/documents?entity_type=Trip&status=PendingReview&per_page=100'],
    ['invoices', '/invoices?per_page=100'],
    ['notifications', '/notifications'],
    ['finished today — OLD way', '/trips?status=Completed,Invoiced&per_page=100'],
    ['finished today — NEW way', `/trips?status=Completed,Invoiced&ended_since=${startOfTodayIso()}&per_page=1&lite=true`],
    ['trucks lookup', '/vehicles?mode=lookup&per_page=100'],
  ],
  Trips: [
    ['Now tab (every 30 s)', '/trips?status=Draft,Scheduled,Loading,InTransit,Delayed&per_page=300'],
    ['Schedule tab', `/trips?start_date=${days(-7)}&end_date=${days(14)}&per_page=500`],
    ['History tab, page 1', '/trips?status=Completed,Invoiced,Cancelled&per_page=30&page=1'],
  ],
};

async function timed(path, token) {
  const t0 = performance.now();
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } });
  const firstByte = performance.now() - t0;
  const buf = Buffer.from(await res.arrayBuffer()); // fetch decompresses; size below is the JSON size
  const total = performance.now() - t0;
  const wire = Number(res.headers.get('content-length')) || null;
  let inline = 0;
  const text = buf.toString('utf8');
  for (const m of text.matchAll(/"data:image\/[^"]{0,40}/g)) inline += 1;
  return { status: res.status, firstByte, total, json: buf.length, wire, inline, text };
}

const kb = (n) => (n == null ? '   ?   ' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const ms = (n) => `${Math.round(n)} ms`;

const username = await ask('Username: ');
const password = await ask('Password: ', true);
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
const token = (await login.json())?.data?.token;
if (!token) { console.error(`Login failed (${login.status}).`); process.exit(1); }

console.log(`\n${API}\n`);
for (const [screen, calls] of Object.entries(SCREENS)) {
  console.log(`── ${screen} ──`);
  const t0 = performance.now();
  // The app sends a screen's requests together; so does this.
  const results = await Promise.all(calls.map(([, p]) => timed(p, token).catch((e) => ({ error: e.message }))));
  const wall = performance.now() - t0;
  results.forEach((r, i) => {
    const name = calls[i][0].padEnd(28);
    if (r.error) return console.log(`  ${name} ERROR ${r.error}`);
    const photos = r.inline ? `  ${r.inline} inline photos` : '';
    console.log(`  ${name} ${String(r.status).padEnd(4)} ${ms(r.total).padStart(8)}  ${kb(r.json).padStart(8)} JSON${photos}`);
  });
  console.log(`  ${'all together (wall clock)'.padEnd(28)}      ${ms(wall).padStart(8)}\n`);
}
