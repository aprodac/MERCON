/**
 * The link preview WhatsApp shows under a tracking link ("Track VRA-3358 ·
 * arrives 21:15"). WhatsApp reads Open Graph tags from the page's HTML without
 * running any script, so the web container's nginx asks the API for these tags
 * and puts them into the page it serves for /t/ and /c/ (see
 * frontend/web-dashboard/nginx.conf).
 */
import type { PublicTracking } from './customerTracking';
import type { CustomerFleetTracking } from './customerFleetTracking';

export interface PreviewTags {
  title: string;
  description: string;
  site_name: string;
  image: string | null;
}

const clock = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export function tripPreview(t: PublicTracking): PreviewTags {
  const truck = [t.vehicle.plate, t.vehicle.type].filter(Boolean).join(' · ');
  const title = truck ? `Track ${truck}` : 'Track your shipment';
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  let description: string;
  if (t.trip.phase === 'done') {
    const last = t.stops[t.stops.length - 1];
    description = t.trip.finished_at ? `Delivered at ${clock(t.trip.finished_at, t.timezone)}${last ? ` · ${last.name}` : ''}` : 'Delivered';
  } else if (t.eta && next) {
    description = t.trip.phase === 'planned'
      ? `Truck arrives for loading at ${next.name} around ${clock(t.eta.arrival, t.timezone)}`
      : `On the way to ${next.name} · arrives around ${clock(t.eta.arrival, t.timezone)}`;
  } else if (t.trip.phase === 'planned') {
    description = 'Scheduled · tap to see where the truck is';
  } else {
    description = next ? `On the way to ${next.name} · tap to see where the truck is` : 'On the way · tap to see where the truck is';
  }
  return { title: `${title} · ${t.brand.name}`, description, site_name: t.brand.name, image: t.brand.logo_url };
}

export function fleetPreview(f: CustomerFleetTracking): PreviewTags {
  // Count trucks, not trips — a truck can carry several queued trips (same as the card).
  const trucks = (phase: string) => new Set(f.trucks.filter((x) => x.phase === phase).map((x) => x.plate || x.token)).size;
  const onRoad = trucks('active');
  const upcoming = trucks('planned');
  const parts = [`${onRoad} on the road`];
  if (upcoming) parts.push(`${upcoming} loading soon`);
  return {
    title: `${f.customer.name} · live trucks · ${f.brand.name}`,
    description: `${parts.join(' · ')} · tap to see where they are`,
    site_name: f.brand.name,
    image: f.brand.logo_url,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The <meta> tags nginx inserts into <head>. `baseUrl` turns a relative logo path into the absolute URL WhatsApp needs.
 * `cardUrl`, when given, is the generated preview card (see trackingPreviewImage) and replaces the plain logo.
 */
export function renderPreviewTags(p: PreviewTags, baseUrl: string | null, cardUrl?: string | null): string {
  const logo = p.image && /^https?:\/\//.test(p.image) ? p.image : p.image && baseUrl ? `${baseUrl}${p.image.startsWith('/') ? '' : '/'}${p.image}` : null;
  const image = cardUrl || logo;
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(p.site_name)}">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    ...(image ? [`<meta property="og:image" content="${esc(image)}">`] : []),
    ...(cardUrl ? [`<meta property="og:image:type" content="image/png">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`] : []),
    `<meta name="twitter:card" content="${cardUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="robots" content="noindex, nofollow">`,
  ].join('\n');
}
