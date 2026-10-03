/**
 * The picture in a tracking link's WhatsApp preview: a clean white card.
 *
 *   trip link (/t/)     customer logo + name · "From → To" · status line ·
 *                       driver photo + truck · a drawing of the route · small company logo
 *   customer link (/c/) customer logo + name · trucks on the road · driver photos ·
 *                       busiest routes · small company logo
 *
 * Built as one SVG (photos embedded, already resized) and rendered to PNG with
 * sharp. The route is drawn from the trip's own coordinates — no map service.
 * Text needs a system font (the API image installs Noto); without one the card
 * still renders, just without words.
 */
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getUploadDir } from '../../middlewares/upload';
import type { PublicTracking } from './customerTracking';
import type { CustomerFleetTracking } from './customerFleetTracking';

const W = 1200;
const H = 630;
const PAD = 56;
const INK = '#2d2b2c';
const MUTED = '#7b7678';
const LINE = '#e7e3e1';
const BRAND = '#fa634e';
/** The web app's own logo file, used when Settings has no logo. */
const COMPANY_LOGO_FALLBACK = '/mercon-logo.png';
const FONT = "'Noto Sans', 'Noto Sans Arabic', 'DejaVu Sans', 'Segoe UI', Arial, sans-serif";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Cut text to roughly fit `maxPx` at `size` (average glyph ≈ 0.56 em). */
function fit(text: string, size: number, maxPx: number): string {
  const max = Math.max(4, Math.floor(maxPx / (size * 0.56)));
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ── Images ─────────────────────────────────────────────────────────────── */

async function readSource(src: string, baseUrl: string | null): Promise<Buffer | null> {
  try {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      return comma > 0 ? Buffer.from(src.slice(comma + 1), 'base64') : null;
    }
    if (src.startsWith('/uploads/')) {
      const name = path.basename(src.split('?')[0]);
      for (const dir of [getUploadDir(), path.resolve(process.cwd(), 'uploads'), '/tmp/uploads']) {
        try { return await fs.readFile(path.join(dir, name)); } catch { /* try the next folder */ }
      }
      // Not on this disk: fall through and fetch it like the page does.
    }
    const url = /^https?:\/\//.test(src) ? src : baseUrl ? `${baseUrl}${src.startsWith('/') ? '' : '/'}${src}` : null;
    if (!url) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** A photo or logo, resized and embedded as a data URI; null when it can't be read. */
async function embed(src: string | null | undefined, w: number, h: number, mode: 'cover' | 'contain', baseUrl: string | null): Promise<string | null> {
  if (!src) return null;
  const buf = await readSource(src, baseUrl);
  if (!buf) return null;
  try {
    const png = await sharp(buf, { density: 300 })
      .resize(w * 2, h * 2, { fit: mode, background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

const initials = (name: string) =>
  name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/** Rounded square logo, or initials on a soft tile. */
function logoTile(id: string, img: string | null, name: string, x: number, y: number, size: number): string {
  const r = size * 0.24;
  if (img) {
    return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}"/></clipPath>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="#fff" stroke="${LINE}" stroke-width="2"/>
      <image href="${img}" x="${x + size * 0.08}" y="${y + size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="#fff1ee"/>
    <text x="${x + size / 2}" y="${y + size * 0.62}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${size * 0.36}" fill="#c2410c">${esc(initials(name))}</text>`;
}

/** Round photo with a white ring, or a soft circle with a truck. */
function avatar(id: string, img: string | null, cx: number, cy: number, r: number, label = ''): string {
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#fff"/>`;
  if (img) {
    return `${ring}<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <image href="${img}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
  }
  const s = r / 28;
  return `${ring}<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f1efee"/>
    ${label
      ? `<text x="${cx}" y="${cy + r * 0.3}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${r * 0.8}" fill="${MUTED}">${esc(label)}</text>`
      : `<g transform="translate(${cx - 16 * s} ${cy - 11 * s}) scale(${s})" fill="${MUTED}"><rect x="0" y="0" width="20" height="16" rx="2.5"/><path d="M21 5h6l5 6v5h-11z"/><circle cx="7" cy="19" r="3.5"/><circle cx="25" cy="19" r="3.5"/></g>`}`;
}

function companyMark(img: string | null, name: string): string {
  // Lower priority: small, bottom-right, softened.
  if (img) return `<image href="${img}" x="${W - PAD - 120}" y="${H - PAD - 60}" width="120" height="60" opacity="0.8" preserveAspectRatio="xMaxYMax meet"/>`;
  return `<text x="${W - PAD}" y="${H - PAD - 8}" text-anchor="end" font-family="${FONT}" font-weight="700" font-size="20" fill="${MUTED}" opacity="0.8">${esc(name)}</text>`;
}

/** The trip's route drawn in a panel: driven part solid, road ahead dashed, stops and the truck. */
function routeDrawing(t: PublicTracking, x: number, y: number, w: number, h: number): string {
  const done = t.path ?? [];
  const ahead = t.ahead ?? [];
  const whole = done.length + ahead.length > 1 ? [] : t.route ?? [];
  const stops = t.stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lng: s.lng as number, lat: s.lat as number, state: s.state }));
  const truck = t.position ? [t.position.lng, t.position.lat] as [number, number] : null;
  const all: [number, number][] = [...done, ...ahead, ...whole, ...stops.map((s) => [s.lng, s.lat] as [number, number]), ...(truck ? [truck] : [])];
  const panel = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#f7f6f5"/>`;
  if (all.length < 2) return panel;

  const lats = all.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = all.map((p) => p[0] * k);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...lats), maxY = Math.max(...lats);
  const inner = 52;
  const scale = Math.min((w - inner * 2) / Math.max(maxX - minX, 1e-4), (h - inner * 2) / Math.max(maxY - minY, 1e-4));
  const ox = x + (w - (maxX - minX) * scale) / 2;
  const oy = y + (h - (maxY - minY) * scale) / 2;
  const P = ([lng, lat]: [number, number]) => [ox + (lng * k - minX) * scale, oy + (maxY - lat) * scale] as const;
  const thin = (pts: [number, number][]) => {
    const step = Math.max(1, Math.ceil(pts.length / 400));
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  };
  const line = (pts: [number, number][]) => thin(pts).map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)} ${P(p)[1].toFixed(1)}`).join(' ');

  let svg = panel;
  // faint grid so the drawing reads as a map
  for (let gx = x + 40; gx < x + w; gx += 48) svg += `<line x1="${gx}" y1="${y + 16}" x2="${gx}" y2="${y + h - 16}" stroke="#efecea" stroke-width="1"/>`;
  for (let gy = y + 40; gy < y + h; gy += 48) svg += `<line x1="${x + 16}" y1="${gy}" x2="${x + w - 16}" y2="${gy}" stroke="#efecea" stroke-width="1"/>`;
  if (whole.length > 1) svg += `<path d="${line(whole)}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 14"/>`;
  if (ahead.length > 1) svg += `<path d="${line(ahead)}" fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 14"/>`;
  if (done.length > 1) svg += `<path d="${line(done)}" fill="none" stroke="${BRAND}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  stops.forEach((s, i) => {
    const [cx, cy] = P([s.lng, s.lat]);
    const last = i === stops.length - 1;
    svg += `<circle cx="${cx}" cy="${cy}" r="13" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="8" fill="${last ? BRAND : s.state === 'done' ? INK : '#fff'}" stroke="${INK}" stroke-width="${s.state === 'done' || last ? 0 : 3}"/>`;
  });
  if (truck && t.trip.phase !== 'done') {
    const [cx, cy] = P(truck);
    svg += `<circle cx="${cx}" cy="${cy}" r="24" fill="${BRAND}" fill-opacity="0.18"/><circle cx="${cx}" cy="${cy}" r="14" fill="${BRAND}" stroke="#fff" stroke-width="4"/>`;
  }
  return svg;
}

const frame = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${BRAND}"/>
    ${body}
  </svg>`;

async function toPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

const clock = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** One short line for the card — no "tap to…", the picture isn't a button. */
function cardStatus(t: PublicTracking): string {
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  if (t.trip.phase === 'done') return t.trip.finished_at ? `Delivered at ${clock(t.trip.finished_at, t.timezone)}` : 'Delivered';
  if (t.eta && next) return t.trip.phase === 'planned' ? `Loading at ${next.name} around ${clock(t.eta.arrival, t.timezone)}` : `Arrives at ${next.name} around ${clock(t.eta.arrival, t.timezone)}`;
  if (t.trip.phase === 'planned') return t.trip.planned_start ? `Scheduled · ${clock(t.trip.planned_start, t.timezone)}` : 'Scheduled';
  return next ? `On the way to ${next.name}` : 'On the way';
}

export async function tripPreviewImage(t: PublicTracking, baseUrl: string | null): Promise<Buffer> {
  const statusLine = cardStatus(t);
  const [custLogo, driverPhoto, companyLogo] = await Promise.all([
    embed(t.customer?.logo_url, 96, 96, 'contain', baseUrl),
    embed(t.driver_photo_url || t.vehicle.photo_url, 96, 96, 'cover', baseUrl),
    embed(t.brand.logo_url || COMPANY_LOGO_FALLBACK, 120, 60, 'contain', baseUrl),
  ]);
  const left = 600; // width of the text column
  const custName = t.customer?.name || t.brand.name;
  const first = t.stops[0]?.name || '';
  const last = t.stops[t.stops.length - 1]?.name || '';
  const roundTrip = (t.trip.route_label || '').includes('⇄') || (first && first === last);
  const to = roundTrip ? (t.stops.find((s) => s.name !== first)?.name || last) : last;
  const done = t.trip.phase === 'done';

  let body = logoTile('cl', custLogo, custName, PAD, PAD, 88);
  body += `<text x="${PAD + 112}" y="${PAD + 40}" font-family="${FONT}" font-weight="700" font-size="32" fill="${INK}">${esc(fit(custName, 32, left - 120))}</text>`;
  body += `<text x="${PAD + 112}" y="${PAD + 76}" font-family="${FONT}" font-size="24" fill="${MUTED}">${esc(t.trip.ref ? `Trip ${t.trip.ref}` : 'Trip tracking')}</text>`;

  // From → To as a small timeline
  const ry = 232;
  body += `<circle cx="${PAD + 12}" cy="${ry}" r="10" fill="${INK}"/>`;
  body += `<line x1="${PAD + 12}" y1="${ry + 16}" x2="${PAD + 12}" y2="${ry + 72}" stroke="${LINE}" stroke-width="4" stroke-dasharray="2 8" stroke-linecap="round"/>`;
  body += `<circle cx="${PAD + 12}" cy="${ry + 88}" r="10" fill="${BRAND}"/>`;
  body += `<text x="${PAD + 40}" y="${ry + 15}" font-family="${FONT}" font-weight="700" font-size="44" fill="${INK}">${esc(fit(first || '—', 44, left - 60))}</text>`;
  body += `<text x="${PAD + 40}" y="${ry + 103}" font-family="${FONT}" font-weight="700" font-size="44" fill="${INK}">${esc(fit(to || '—', 44, left - 60))}${roundTrip ? `<tspan dx="16" font-weight="400" font-size="26" fill="${MUTED}">and back</tspan>` : ''}</text>`;

  // Status pill
  const status = fit(statusLine, 24, left - 40);
  const pillW = Math.min(left, status.length * 24 * 0.56 + 48);
  body += `<rect x="${PAD}" y="${ry + 140}" width="${pillW}" height="48" rx="24" fill="${done ? '#e9f7ef' : '#fff1ee'}"/>`;
  body += `<text x="${PAD + 24}" y="${ry + 172}" font-family="${FONT}" font-weight="600" font-size="24" fill="${done ? '#1f7a45' : '#c2410c'}">${esc(status)}</text>`;

  // Crew
  const cy = H - PAD - 46;
  body += avatar('dp', driverPhoto, PAD + 40, cy, 40);
  const truck = [t.vehicle.plate, t.vehicle.type].filter(Boolean).join(' · ');
  body += `<text x="${PAD + 100}" y="${cy - 4}" font-family="${FONT}" font-weight="700" font-size="28" fill="${INK}">${esc(fit(t.driver_first_name || truck || 'Your truck', 28, left - 120))}</text>`;
  if (t.driver_first_name && truck) body += `<text x="${PAD + 100}" y="${cy + 30}" font-family="${FONT}" font-size="22" fill="${MUTED}">${esc(fit(truck, 22, left - 120))}</text>`;

  body += routeDrawing(t, PAD + left + 24, PAD, W - PAD * 2 - left - 24, H - PAD * 2 - 84);
  body += companyMark(companyLogo, t.brand.name);
  return toPng(frame(body));
}

export async function fleetPreviewImage(f: CustomerFleetTracking, baseUrl: string | null): Promise<Buffer> {
  // A truck can carry several queued trips — count and show each truck once.
  const uniq = (list: typeof f.trucks) => [...new Map(list.map((x) => [x.plate || x.token, x])).values()];
  const onRoad = uniq(f.trucks.filter((x) => x.phase === 'active'));
  const soon = uniq(f.trucks.filter((x) => x.phase === 'planned')).length;
  const faces = onRoad.slice(0, 5);
  const [custLogo, companyLogo, ...photos] = await Promise.all([
    embed(f.customer.logo_url, 120, 120, 'contain', baseUrl),
    embed(f.brand.logo_url || COMPANY_LOGO_FALLBACK, 120, 60, 'contain', baseUrl),
    ...faces.map((x) => embed(x.driver_photo_url || x.vehicle_photo_url, 80, 80, 'cover', baseUrl)),
  ]);

  let body = logoTile('cl', custLogo, f.customer.name, PAD, PAD, 112);
  body += `<text x="${PAD + 136}" y="${PAD + 52}" font-family="${FONT}" font-weight="700" font-size="40" fill="${INK}">${esc(fit(f.customer.name, 40, W - PAD * 2 - 140))}</text>`;
  body += `<text x="${PAD + 136}" y="${PAD + 94}" font-family="${FONT}" font-size="26" fill="${MUTED}">Live trucks</text>`;

  // The big number
  const ny = 300;
  body += `<text x="${PAD}" y="${ny}" font-family="${FONT}" font-weight="700" font-size="96" fill="${INK}">${onRoad.length}</text>`;
  const numW = String(onRoad.length).length * 96 * 0.6;
  body += `<text x="${PAD + numW + 20}" y="${ny - 44}" font-family="${FONT}" font-weight="600" font-size="30" fill="${INK}">on the road</text>`;
  body += `<text x="${PAD + numW + 20}" y="${ny - 6}" font-family="${FONT}" font-size="24" fill="${MUTED}">${soon ? `${soon} loading soon` : 'right now'}</text>`;

  // Faces of the drivers on the road
  const fy = ny + 90;
  faces.forEach((x, i) => { body += avatar(`f${i}`, photos[i], PAD + 40 + i * 62, fy, 34); });
  if (onRoad.length > faces.length) body += avatar('more', null, PAD + 40 + faces.length * 62, fy, 34, `+${onRoad.length - faces.length}`);

  // Busiest routes
  const counts = new Map<string, number>();
  onRoad.forEach((x) => { if (x.route_label) counts.set(x.route_label, (counts.get(x.route_label) ?? 0) + 1); });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const px = 660, py = 176, pw = W - PAD - px;
  if (top.length) {
    body += `<rect x="${px}" y="${py}" width="${pw}" height="${top.length * 64 + 64}" rx="28" fill="#f7f6f5"/>`;
    body += `<text x="${px + 32}" y="${py + 44}" font-family="${FONT}" font-weight="600" font-size="22" fill="${MUTED}">Routes today</text>`;
    top.forEach(([label, n], i) => {
      const y = py + 96 + i * 64;
      body += `<circle cx="${px + 40}" cy="${y - 8}" r="8" fill="${i === 0 ? BRAND : INK}"/>`;
      body += `<text x="${px + 64}" y="${y}" font-family="${FONT}" font-weight="600" font-size="26" fill="${INK}">${esc(fit(label, 26, pw - 200))}</text>`;
      body += `<text x="${px + pw - 32}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="24" fill="${MUTED}">${n} ${n === 1 ? 'truck' : 'trucks'}</text>`;
    });
  }
  body += companyMark(companyLogo, f.brand.name);
  return toPng(frame(body));
}
