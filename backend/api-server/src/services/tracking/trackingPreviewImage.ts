/**
 * The picture in a tracking link's WhatsApp preview: a clean white card.
 *
 *   trip link (/t/)     customer logo + name · "From → To" · status line ·
 *                       driver photo + truck · a details panel by phase (when it
 *                       starts / when it arrives, how far, on time or late, stop
 *                       progress / when it was delivered) stamped "As of 13:05",
 *                       since WhatsApp keeps the picture from when it was sent ·
 *                       small company logo
 *   customer link (/c/) customer logo + name · trucks on the road · driver photos ·
 *                       busiest routes · small company logo
 *
 * Built as one SVG (photos embedded, already resized) and rendered to PNG with
 * sharp. No map: a drawn route on a blank grid said little (a scheduled trip
 * was a dotted line between two dots), so the trip card shows the facts instead.
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

const dayKey = (iso: string | Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** "Today", "Tomorrow", "Yesterday" or "Mon 5 Oct" in the deployment time zone. */
function dayWord(iso: string, tz: string, now: Date): string {
  const d = dayKey(iso, tz);
  const shift = (days: number) => dayKey(new Date(now.getTime() + days * 86_400_000), tz);
  if (d === shift(0)) return 'Today';
  if (d === shift(1)) return 'Tomorrow';
  if (d === shift(-1)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "1 h 40 min", "35 min", "2 d 4 h". */
function span(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

const km = (meters: number) => (meters < 10_000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 1000)} km`);

/**
 * The right half of the trip card: what the customer wants to know at this
 * stage, in large type. Every value is as of `generated_at`, printed at the bottom.
 */
function detailsPanel(t: PublicTracking, x: number, y: number, w: number, h: number): string {
  const tz = t.timezone;
  const now = new Date(t.generated_at);
  const pad = 36;
  const tx = x + pad;
  const maxW = w - pad * 2;
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  const doneStops = t.stops.filter((s) => s.state === 'done').length;
  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#f7f6f5"/>`;
  const label = (text: string, yy: number, color = MUTED) =>
    `<text x="${tx}" y="${yy}" font-family="${FONT}" font-weight="700" font-size="22" letter-spacing="1.5" fill="${color}">${esc(fit(text.toUpperCase(), 22, maxW))}</text>`;
  const big = (text: string, yy: number, color = INK, size = 76) =>
    `<text x="${tx}" y="${yy}" font-family="${FONT}" font-weight="800" font-size="${size}" fill="${color}">${esc(fit(text, size, maxW))}</text>`;
  const line = (text: string, yy: number, color = INK, weight = 600, size = 26) =>
    `<text x="${tx}" y="${yy}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" fill="${color}">${esc(fit(text, size, maxW))}</text>`;
  const pill = (text: string, yy: number, good: boolean) => {
    const pw = Math.min(maxW, text.length * 24 * 0.58 + 40);
    return `<rect x="${tx}" y="${yy - 32}" width="${pw}" height="44" rx="22" fill="${good ? '#e9f7ef' : '#fdecea'}"/>`
      + `<text x="${tx + 20}" y="${yy - 3}" font-family="${FONT}" font-weight="700" font-size="24" fill="${good ? '#1f7a45' : '#c0392b'}">${esc(text)}</text>`;
  };
  /** Stops as dots on a line: done ink, next brand, still to come hollow. */
  const progress = (yy: number) => {
    const n = t.stops.length;
    if (n < 2) return '';
    let out = `<line x1="${tx + 10}" y1="${yy}" x2="${tx + maxW - 10}" y2="${yy}" stroke="${LINE}" stroke-width="6" stroke-linecap="round"/>`;
    const step = (maxW - 20) / (n - 1);
    const reached = Math.max(doneStops - 1, 0);
    if (doneStops > 1) out += `<line x1="${tx + 10}" y1="${yy}" x2="${tx + 10 + step * reached}" y2="${yy}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    t.stops.forEach((s, i) => {
      const cx = tx + 10 + step * i;
      const fill = s.state === 'done' ? INK : s.state === 'next' ? BRAND : '#ffffff';
      out += `<circle cx="${cx}" cy="${yy}" r="11" fill="${fill}" stroke="${s.state === 'upcoming' ? '#b9b4b1' : fill}" stroke-width="4"/>`;
    });
    return out + line(`${doneStops} of ${n} stops done`, yy + 44, MUTED, 500, 22);
  };

  const top = y + pad + 22;
  if (t.trip.phase === 'done') {
    svg += label('Delivered', top, '#1f7a45');
    svg += big(t.trip.finished_at ? clock(t.trip.finished_at, tz) : '✓', top + 82, '#1f7a45');
    if (t.trip.finished_at) svg += line(dayWord(t.trip.finished_at, tz, now), top + 126, INK, 600);
    svg += line(`All ${t.stops.length} stops done`, top + 172, MUTED, 500, 24);
    const photos = t.stops.reduce((n, s) => n + (s.photos?.length ?? 0), 0);
    if (photos) svg += line(`${photos} delivery photo${photos === 1 ? '' : 's'} on the link`, top + 210, MUTED, 500, 24);
  } else if (t.trip.phase === 'planned') {
    svg += label('Starts', top);
    svg += big(t.trip.planned_start ? clock(t.trip.planned_start, tz) : '—', top + 82);
    if (t.trip.planned_start) svg += line(dayWord(t.trip.planned_start, tz, now), top + 126, INK, 600);
    const crew = [t.driver_first_name, t.vehicle.plate].filter(Boolean).join(' · ');
    if (crew) svg += line(crew, top + 172, MUTED, 500, 24);
    if (t.eta && next) svg += line(`Truck ${km(t.eta.distance_m)} from ${next.name}`, top + 210, MUTED, 500, 24);
  } else if (t.eta && next) {
    const late = t.punctuality?.late_min ?? null;
    svg += label(`Arrives ${next.name}`, top);
    svg += big(clock(t.eta.arrival, tz), top + 82);
    svg += line(`in ${span(t.eta.seconds)} · ${km(t.eta.distance_m)}`, top + 124, INK, 600);
    let yy = top + 178;
    if (late != null) { svg += pill(late > 0 ? `${span(late * 60)} late` : 'On time', yy, late <= 0); yy += 54; }
    if (t.delay?.reason) { svg += line(t.delay.reason, yy, '#c0392b', 600, 22); yy += 36; }
    svg += progress(Math.max(yy + 10, y + h - 118));
  } else {
    svg += label(next ? 'On the way to' : 'On the way', top);
    if (next) svg += big(next.name, top + 72, INK, 52);
    svg += line('Live position and ETA on the link', top + 120, MUTED, 500, 24);
    svg += progress(y + h - 118);
  }
  svg += `<text x="${tx}" y="${y + h - 24}" font-family="${FONT}" font-size="20" fill="${MUTED}">As of ${esc(clock(t.generated_at, tz))} · ${esc(dayWord(t.generated_at, tz, now))}</text>`;
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

/** The stage in a word or two — the details panel beside it has the times. */
function cardStatus(t: PublicTracking): { text: string; tone: 'good' | 'bad' | 'live' } {
  if (t.trip.phase === 'done') return { text: 'Delivered', tone: 'good' };
  if (t.trip.phase === 'cancelled') return { text: 'Cancelled', tone: 'bad' };
  if (t.trip.phase === 'planned') return { text: 'Scheduled', tone: 'live' };
  if ((t.punctuality?.late_min ?? 0) > 0) return { text: 'Running late', tone: 'bad' };
  // Still going to (or at) the pickup.
  return { text: t.next_stop_index === 0 ? 'Loading' : 'On the way', tone: 'live' };
}

export async function tripPreviewImage(t: PublicTracking, baseUrl: string | null): Promise<Buffer> {
  const stage = cardStatus(t);
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
  const status = fit(stage.text, 24, left - 40);
  const pillW = Math.min(left, status.length * 24 * 0.56 + 48);
  body += `<rect x="${PAD}" y="${ry + 140}" width="${pillW}" height="48" rx="24" fill="${stage.tone === 'good' ? '#e9f7ef' : stage.tone === 'bad' ? '#fdecea' : '#fff1ee'}"/>`;
  body += `<text x="${PAD + 24}" y="${ry + 172}" font-family="${FONT}" font-weight="600" font-size="24" fill="${stage.tone === 'good' ? '#1f7a45' : stage.tone === 'bad' ? '#c0392b' : '#c2410c'}">${esc(status)}</text>`;

  // Crew
  const cy = H - PAD - 46;
  body += avatar('dp', driverPhoto, PAD + 40, cy, 40);
  const truck = [t.vehicle.plate, t.vehicle.type].filter(Boolean).join(' · ');
  body += `<text x="${PAD + 100}" y="${cy - 4}" font-family="${FONT}" font-weight="700" font-size="28" fill="${INK}">${esc(fit(t.driver_first_name || truck || 'Your truck', 28, left - 120))}</text>`;
  if (t.driver_first_name && truck) body += `<text x="${PAD + 100}" y="${cy + 30}" font-family="${FONT}" font-size="22" fill="${MUTED}">${esc(fit(truck, 22, left - 120))}</text>`;

  body += detailsPanel(t, PAD + left + 24, PAD, W - PAD * 2 - left - 24, H - PAD * 2 - 84);
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
      body += `<text x="${px + 64}" y="${y}" font-family="${FONT}" font-weight="600" font-size="26" fill="${INK}">${esc(fit(label, 26, pw - 250))}</text>`;
      body += `<text x="${px + pw - 32}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="24" fill="${MUTED}">${n} ${n === 1 ? 'truck' : 'trucks'}</text>`;
    });
  }
  body += companyMark(companyLogo, f.brand.name);
  return toPng(frame(body));
}
