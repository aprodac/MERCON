/**
 * The operator inbox beside the dashboard map.
 *
 * Two jobs, both previously done by hand in the old Operator Command box:
 *  1. Driver updates — every batch of photos / video a driver sends from a
 *     stop (Loaded, Arrived, Delivered · POD, Delay video) so the operator can
 *     forward it on WhatsApp. Forwards are logged in `trip_update_shares` and
 *     shared by every operator, so nothing is sent twice or forgotten.
 *  2. Document expiries — computed on the server from every document (the old
 *     box only saw the first 200) plus drivers' licence dates, keeping only the
 *     newest document per slot so a renewed document stops alerting.
 */
import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { groupTripMedia, type LiveMediaItem, type LiveMediaStage, type TripMediaDocRow, type TripMediaStopRow } from './fleetLiveMap';

// ── Driver updates ──────────────────────────────────────────────────────────

export const DRIVER_UPDATE_WINDOW_DAYS = 3;
export const SHARE_LINK_TTL_DAYS = 90;
const MAX_UPDATES = 80;

export type ShareRecipient = 'customer_contact' | 'customer_group' | 'internal' | 'other';
export type ShareChannel = 'link' | 'whatsapp_api';

export interface InboxCustomer {
  name: string;
  whatsapp_number: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  group_name: string | null;
  group_link: string | null;
}

export interface DriverUpdateShare {
  id: string;
  recipient: ShareRecipient;
  channel: ShareChannel;
  shared_by: string | null;
  shared_at: string;
  count: number;
}

export interface DriverUpdate {
  /** `<stop id | trip>:<stage>` — stable across refreshes. */
  key: string;
  trip: { id: string; ref_id: string | null; status: string; route: string };
  customer: InboxCustomer | null;
  vehicle_plate: string | null;
  driver: { name: string; phone: string | null } | null;
  stop: { id: string; name: string; type: string; sequence: number } | null;
  stage: LiveMediaStage;
  items: LiveMediaItem[];
  delay_note: string | null;
  latest_at: string;
  shares: DriverUpdateShare[];
  /** Items already included in a forward. */
  sent_ids: string[];
  /** Items not included in any forward yet. */
  unsent_count: number;
}

interface TripRowForUpdates {
  id: string;
  ref_id: string | null;
  status: string;
  customer: {
    name: string;
    whatsapp_number: string | null;
    primary_contact_person: string | null;
    primary_contact_phone: string | null;
    contact_phone: string | null;
    whatsapp_group_name: string | null;
    whatsapp_group_link: string | null;
  } | null;
  vehicle: { plate_number: string } | null;
  driver: { first_name: string; last_name: string; phone_primary: string | null } | null;
  stops: Array<TripMediaStopRow & { stop_type: string; location_name: string | null; location_address: string | null }>;
}

interface ShareRow {
  id: string;
  tripId: string;
  update_key: string;
  media_ids: string[];
  channel: string;
  recipient: string;
  createdAt: Date;
  sharedBy: { name: string | null; username: string } | null;
}

function stopName(s: { location_name: string | null; location_address: string | null; stop_sequence: number }): string {
  return s.location_name || s.location_address || `Stop ${s.stop_sequence}`;
}

function routeOf(stops: TripRowForUpdates['stops']): string {
  const ordered = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  if (ordered.length === 0) return '';
  const first = stopName(ordered[0]);
  const last = stopName(ordered[ordered.length - 1]);
  return ordered.length === 1 ? first : `${first} → ${last}`;
}

/**
 * Turns trips + their recent uploads + the share log into one row per batch
 * (a stop and step), unsent first, newest first.
 */
export function buildDriverUpdates(
  trips: TripRowForUpdates[],
  docsByTrip: Map<string, TripMediaDocRow[]>,
  shares: ShareRow[],
): DriverUpdate[] {
  const out: DriverUpdate[] = [];
  const sharesByKey = new Map<string, ShareRow[]>();
  for (const s of shares) {
    const k = `${s.tripId}|${s.update_key}`;
    sharesByKey.set(k, [...(sharesByKey.get(k) ?? []), s]);
  }

  for (const t of trips) {
    const docs = docsByTrip.get(t.id) ?? [];
    if (docs.length === 0) continue;
    const media = groupTripMedia(t.stops, docs);
    const stopById = new Map(t.stops.map((s) => [s.id, s]));
    const customer: InboxCustomer | null = t.customer
      ? {
          name: t.customer.name,
          whatsapp_number: t.customer.whatsapp_number,
          contact_person: t.customer.primary_contact_person,
          contact_phone: t.customer.primary_contact_phone || t.customer.contact_phone,
          group_name: t.customer.whatsapp_group_name,
          group_link: t.customer.whatsapp_group_link,
        }
      : null;
    const base = {
      trip: { id: t.id, ref_id: t.ref_id, status: t.status, route: routeOf(t.stops) },
      customer,
      vehicle_plate: t.vehicle?.plate_number ?? null,
      driver: t.driver ? { name: `${t.driver.first_name} ${t.driver.last_name}`.trim(), phone: t.driver.phone_primary } : null,
    };

    const batches: Array<{ stopId: string | null; delayNote: string | null; items: LiveMediaItem[] }> = [
      ...media.stops.map((s) => ({ stopId: s.stop_id, delayNote: s.delay?.note ?? null, items: s.media })),
      { stopId: null, delayNote: null, items: media.unplaced },
    ];

    for (const b of batches) {
      const byStage = new Map<LiveMediaStage, LiveMediaItem[]>();
      for (const it of b.items) byStage.set(it.stage, [...(byStage.get(it.stage) ?? []), it]);
      for (const [stage, items] of byStage) {
        const key = `${b.stopId ?? 'trip'}:${stage}`;
        const rows = sharesByKey.get(`${t.id}|${key}`) ?? [];
        const sent = new Set(rows.flatMap((r) => r.media_ids));
        const s = b.stopId ? stopById.get(b.stopId) : undefined;
        out.push({
          ...base,
          key,
          stop: s ? { id: s.id, name: stopName(s), type: s.stop_type, sequence: s.stop_sequence } : null,
          stage,
          items,
          delay_note: stage === 'delay' ? b.delayNote : null,
          latest_at: items.reduce((m, i) => (i.captured_at > m ? i.captured_at : m), items[0].captured_at),
          shares: rows
            .sort((a, z) => new Date(z.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((r) => ({
              id: r.id,
              recipient: r.recipient as ShareRecipient,
              channel: r.channel as ShareChannel,
              shared_by: r.sharedBy?.name || r.sharedBy?.username || null,
              shared_at: new Date(r.createdAt).toISOString(),
              count: r.media_ids.length,
            })),
          sent_ids: items.filter((i) => sent.has(i.id)).map((i) => i.id),
          unsent_count: items.filter((i) => !sent.has(i.id)).length,
        });
      }
    }
  }

  return out
    .sort((a, b) => {
      const au = a.unsent_count > 0 ? 1 : 0;
      const bu = b.unsent_count > 0 ? 1 : 0;
      return bu - au || b.latest_at.localeCompare(a.latest_at);
    })
    .slice(0, MAX_UPDATES);
}

const STAGE_PHRASE: Record<LiveMediaStage, string> = {
  loaded: 'Loaded at',
  arrived: 'Arrived at',
  stop: 'Stop at',
  delivered: 'Delivered at',
  delay: 'Delay on the way to',
  other: 'Photos from',
};

export function updateHeadline(u: Pick<DriverUpdate, 'stage' | 'stop'>): string {
  return u.stop ? `${STAGE_PHRASE[u.stage]} ${u.stop.name}` : u.stage === 'delay' ? 'Delay reported' : 'Trip photos';
}

/** The WhatsApp message. Kept short — operators forward many of these a day. */
export function buildShareMessage(u: DriverUpdate, items: LiveMediaItem[], shareUrl: string): string {
  const photos = items.filter((i) => i.kind !== 'video').length;
  const videos = items.length - photos;
  const what = [photos ? `${photos} photo${photos > 1 ? 's' : ''}` : '', videos ? `${videos} video${videos > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(' + ');
  const lines = [`*${[u.trip.ref_id, updateHeadline(u)].filter(Boolean).join(' · ')}*`];
  const sub = [u.customer?.name, u.trip.route].filter(Boolean).join(' · ');
  if (sub) lines.push(sub);
  const who = [u.vehicle_plate ? `Truck ${u.vehicle_plate}` : '', u.driver?.name ? `Driver ${u.driver.name}` : ''].filter(Boolean).join(' · ');
  if (who) lines.push(who);
  if (u.delay_note) lines.push(`Reason: ${u.delay_note}`);
  lines.push('', `${what || 'Media'}: ${shareUrl}`);
  return lines.join('\n');
}

export function newShareToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

/** Recent updates across all trips — the inbox list. */
export async function loadDriverUpdates(db: PrismaClient, now = new Date()): Promise<DriverUpdate[]> {
  const since = new Date(now.getTime() - DRIVER_UPDATE_WINDOW_DAYS * 86_400_000);
  return loadUpdatesWhere(db, { createdAt: { gte: since } });
}

/** Every update for one trip, however old — used when sharing and on the public page. */
export async function loadTripDriverUpdates(db: PrismaClient, tripId: string): Promise<DriverUpdate[]> {
  return loadUpdatesWhere(db, { entity_id: tripId });
}

async function loadUpdatesWhere(
  db: PrismaClient,
  extra: { createdAt?: { gte: Date }; entity_id?: string },
): Promise<DriverUpdate[]> {
  const docs = await db.document.findMany({
    where: { entity_type: 'Trip', deletedAt: null, doc_type: { in: ['POD', 'Waybill'] }, ...extra },
    select: {
      id: true,
      entity_id: true,
      doc_type: true,
      file_url: true,
      mime_type: true,
      ai_extracted_json: true,
      createdAt: true,
      files: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' }, select: { id: true, file_url: true, mime_type: true } },
    },
  });
  const docsByTrip = new Map<string, TripMediaDocRow[]>();
  for (const d of docs) docsByTrip.set(d.entity_id, [...(docsByTrip.get(d.entity_id) ?? []), d as unknown as TripMediaDocRow]);
  const tripIds = [...docsByTrip.keys()];
  if (tripIds.length === 0) return [];

  const [trips, shares] = await Promise.all([
    db.trip.findMany({
      where: { id: { in: tripIds }, deletedAt: null },
      select: {
        id: true,
        ref_id: true,
        status: true,
        customer: {
          select: {
            name: true, whatsapp_number: true, primary_contact_person: true, primary_contact_phone: true,
            contact_phone: true, whatsapp_group_name: true, whatsapp_group_link: true,
          },
        },
        vehicle: { select: { plate_number: true } },
        driver: { select: { first_name: true, last_name: true, phone_primary: true } },
        stops: {
          where: { deletedAt: null },
          select: {
            id: true, stop_sequence: true, stop_type: true, location_name: true, location_address: true,
            actual_arrival: true, delay_reason: true, delay_note: true, delay_logged_at: true,
          },
        },
      },
    }),
    db.tripUpdateShare.findMany({
      where: { tripId: { in: tripIds } },
      select: {
        id: true, tripId: true, update_key: true, media_ids: true, channel: true, recipient: true, createdAt: true,
        sharedBy: { select: { name: true, username: true } },
      },
    }),
  ]);

  return buildDriverUpdates(trips as unknown as TripRowForUpdates[], docsByTrip, shares);
}

// ── Document expiries ───────────────────────────────────────────────────────

export const EXPIRY_WINDOW_DAYS = 30;

export interface ExpiryItem {
  /** `doc:<id>` or `licence:<driver id>`. */
  key: string;
  entity_type: 'Vehicle' | 'Driver' | 'Customer' | 'Company' | 'Other';
  entity_id: string;
  entity_name: string;
  label: string;
  expiry_date: string;
  /** Whole days until expiry; negative once expired. */
  days: number;
  document_id: string | null;
  document_type_id: string | null;
  doc_type: string | null;
  /** Who to remind — the driver, or the vehicle's assigned driver. */
  contact: { name: string; phone: string } | null;
  /** The truck or driver is on a running trip right now. */
  on_trip_ref: string | null;
}

export interface ExpiryDocRow {
  id: string;
  entity_type: string;
  entity_id: string;
  doc_type: string | null;
  documentTypeId: string | null;
  documentType: { name: string } | null;
  expiry_date: Date | null;
  status: string;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  DriverLicense: 'Driving licence',
  VehicleRegistration: 'Registration (Istimara)',
  Insurance: 'Insurance',
  Passport: 'Passport',
  CustomsClearance: 'Customs clearance',
  Contract: 'Contract',
};

export function daysUntil(date: Date, now: Date): number {
  const DAY = 86_400_000;
  const startOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOf(date) - startOf(now)) / DAY);
}

/**
 * Only the newest document in each slot (owner + document type) counts. When a
 * driver uploads a renewed licence the old one still exists; it must not keep
 * alerting.
 */
export function latestPerSlot(docs: ExpiryDocRow[]): ExpiryDocRow[] {
  const best = new Map<string, ExpiryDocRow>();
  for (const d of docs) {
    if (!d.expiry_date || d.status === 'Rejected') continue;
    const slot = `${d.entity_type}|${d.entity_id}|${d.documentTypeId ?? d.doc_type ?? d.documentType?.name ?? d.id}`;
    const cur = best.get(slot);
    if (!cur || new Date(d.expiry_date) > new Date(cur.expiry_date!)) best.set(slot, d);
  }
  return [...best.values()];
}

export async function loadDocumentExpiries(db: PrismaClient, now = new Date()): Promise<ExpiryItem[]> {
  const horizon = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86_400_000);
  const running = ['Loading', 'InTransit', 'Delayed'] as const;

  const [docs, drivers, vehicles, customers, activeTrips] = await Promise.all([
    db.document.findMany({
      where: { deletedAt: null, expiry_date: { not: null }, entity_type: { in: ['Vehicle', 'Driver', 'Customer', 'Company'] } },
      select: {
        id: true, entity_type: true, entity_id: true, doc_type: true, documentTypeId: true,
        documentType: { select: { name: true } }, expiry_date: true, status: true,
      },
    }),
    db.driver.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, first_name: true, last_name: true, phone_primary: true, license_expiry: true, assignedVehicleId: true },
    }),
    db.vehicle.findMany({ where: { deletedAt: null }, select: { id: true, plate_number: true } }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    db.trip.findMany({
      where: { deletedAt: null, status: { in: [...running] } },
      select: { ref_id: true, id: true, vehicleId: true, driverId: true },
    }),
  ]);

  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const driverByVehicle = new Map(drivers.filter((d) => d.assignedVehicleId).map((d) => [d.assignedVehicleId!, d]));
  const plateById = new Map(vehicles.map((v) => [v.id, v.plate_number]));
  const customerById = new Map(customers.map((c) => [c.id, c.name]));
  const tripByVehicle = new Map(activeTrips.filter((t) => t.vehicleId).map((t) => [t.vehicleId!, t.ref_id ?? t.id]));
  const tripByDriver = new Map(activeTrips.filter((t) => t.driverId).map((t) => [t.driverId!, t.ref_id ?? t.id]));
  const nameOf = (d: { first_name: string; last_name: string }) => `${d.first_name} ${d.last_name}`.trim();

  const items: ExpiryItem[] = [];
  const driversWithLicenceDoc = new Set<string>();

  for (const d of latestPerSlot(docs as ExpiryDocRow[])) {
    const label = d.documentType?.name || (d.doc_type ? DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type : 'Document');
    if (d.entity_type === 'Driver' && (d.doc_type === 'DriverLicense' || /licen[cs]e/i.test(label))) driversWithLicenceDoc.add(d.entity_id);
    if (new Date(d.expiry_date!) > horizon) continue;

    const driver = d.entity_type === 'Driver' ? driverById.get(d.entity_id) : d.entity_type === 'Vehicle' ? driverByVehicle.get(d.entity_id) : undefined;
    if (d.entity_type === 'Driver' && !driver) continue; // deleted or inactive driver
    const entityName =
      d.entity_type === 'Vehicle' ? plateById.get(d.entity_id) :
      d.entity_type === 'Driver' ? (driver ? nameOf(driver) : undefined) :
      d.entity_type === 'Customer' ? customerById.get(d.entity_id) :
      'Company';
    if (!entityName) continue; // owner no longer exists

    items.push({
      key: `doc:${d.id}`,
      entity_type: d.entity_type as ExpiryItem['entity_type'],
      entity_id: d.entity_id,
      entity_name: entityName,
      label,
      expiry_date: new Date(d.expiry_date!).toISOString(),
      days: daysUntil(new Date(d.expiry_date!), now),
      document_id: d.id,
      document_type_id: d.documentTypeId,
      doc_type: d.doc_type,
      contact: driver?.phone_primary ? { name: nameOf(driver), phone: driver.phone_primary } : null,
      on_trip_ref: d.entity_type === 'Vehicle' ? tripByVehicle.get(d.entity_id) ?? null : d.entity_type === 'Driver' ? tripByDriver.get(d.entity_id) ?? null : null,
    });
  }

  // Licence dates live on the driver record too; use them when no licence document carries the date.
  for (const d of drivers) {
    if (driversWithLicenceDoc.has(d.id) || !d.license_expiry || d.license_expiry > horizon) continue;
    items.push({
      key: `licence:${d.id}`,
      entity_type: 'Driver',
      entity_id: d.id,
      entity_name: nameOf(d),
      label: 'Driving licence',
      expiry_date: d.license_expiry.toISOString(),
      days: daysUntil(d.license_expiry, now),
      document_id: null,
      document_type_id: null,
      doc_type: 'DriverLicense',
      contact: d.phone_primary ? { name: nameOf(d), phone: d.phone_primary } : null,
      on_trip_ref: tripByDriver.get(d.id) ?? null,
    });
  }

  return items.sort((a, b) => a.days - b.days);
}
