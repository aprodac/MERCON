/**
 * Quotation expiry alerts. Once a day, every active quotation that ends within
 * EXPIRY_ALERT_DAYS and hasn't been alerted for its current end date yet
 * becomes a notification (and operator-app push) for every active Admin and
 * Operator — so a customer's rate is renewed before trips stop finding it.
 *
 * Up to SUMMARY_OVER quotations go out one by one (tap → that quotation);
 * more than that go out as one summary (tap → the Quotations page) so a big
 * batch doesn't flood phones. Each alerted quotation gets an audit-log marker
 * for its end date, so a restart or the next day's run never repeats it, and a
 * renewed quotation (new end date) is alerted again when that date nears.
 */
import { Role } from '@prisma/client';
import { formatQuotationRef } from '@mercon/shared-types';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { createNotification } from '../controllers/notificationController';

export const EXPIRY_ALERT_DAYS = 7;
const SUMMARY_OVER = 5;
export const EXPIRY_ALERT_ACTION = 'QUOTATION_EXPIRY_ALERTED';
const DAY = 24 * 3600_000;

let timer: NodeJS.Timeout | null = null;

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "Dammam → Jubail → Hafar Al Batin" from the stops, else the quotation name. */
function routeOf(q: { name: string; stops: { leg_index: number; source_label: string | null; location: { name: string } | null }[] }): string {
  const out = q.stops.filter((s) => (s.leg_index ?? 0) === 0);
  const names = (out.length >= 2 ? out : q.stops).map((s) => titleCase(s.source_label || s.location?.name || '')).filter(Boolean);
  return names.length >= 2 ? names.join(' → ') : titleCase(q.name).replace(/\s*->\s*/g, ' → ');
}

export function daysLeftText(validTo: Date, now: Date): string {
  const days = Math.ceil((validTo.getTime() - now.getTime()) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export async function runQuotationExpiryAlerts(now = new Date()): Promise<number> {
  const soon = await prisma.quotation.findMany({
    where: { deletedAt: null, is_active: true, valid_to: { gt: now, lte: new Date(now.getTime() + EXPIRY_ALERT_DAYS * DAY) } },
    select: {
      id: true, name: true, quotation_number: true, vehicle_class: true, source_vehicle_label: true, valid_to: true,
      customer: { select: { name: true } },
      stops: { orderBy: { sequence: 'asc' }, select: { leg_index: true, source_label: true, location: { select: { name: true } } } },
    },
    orderBy: { valid_to: 'asc' },
  });
  if (!soon.length) return 0;

  // Already alerted for this same end date → skip.
  const markers = await prisma.auditLog.findMany({
    where: { action: EXPIRY_ALERT_ACTION, entityType: 'Quotation', entityId: { in: soon.map((q) => q.id) } },
    select: { entityId: true, metadata: true },
  });
  const done = new Set(markers.map((m) => `${m.entityId}|${(m.metadata as any)?.valid_to ?? ''}`));
  const fresh = soon.filter((q) => !done.has(`${q.id}|${q.valid_to!.toISOString()}`));
  if (!fresh.length) return 0;

  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (fresh.length > SUMMARY_OVER) {
    const companies = new Set(fresh.map((q) => q.customer.name)).size;
    const title = `${fresh.length} quotations expire soon`;
    const message = `${fresh.length} rates for ${companies} ${companies === 1 ? 'customer' : 'customers'} end within ${EXPIRY_ALERT_DAYS} days. Open Quotations → Needs attention → Expiring soon to renew them.`;
    await Promise.all(staff.map((u) => createNotification(u.id, title, message, 'QuotationExpiring', 'QuotationList')));
  } else {
    for (const q of fresh) {
      const truck = q.vehicle_class || q.source_vehicle_label;
      const title = `Quotation expires ${daysLeftText(q.valid_to!, now)}`;
      const message = `${titleCase(q.customer.name)}: ${routeOf(q)}${truck ? ` (${truck})` : ''}${formatQuotationRef(q.quotation_number) ? ` · ${formatQuotationRef(q.quotation_number)}` : ''}. Renew it so new trips keep finding the rate.`;
      await Promise.all(staff.map((u) => createNotification(u.id, title, message, 'QuotationExpiring', 'Quotation', q.id)));
    }
  }

  await prisma.auditLog.createMany({
    data: fresh.map((q) => ({ action: EXPIRY_ALERT_ACTION, entityType: 'Quotation', entityId: q.id, metadata: { valid_to: q.valid_to!.toISOString() } })),
  });
  logger.info({ alerted: fresh.length }, '[QuotationExpiry] Alerted staff of expiring quotations');
  return fresh.length;
}

/** Runs shortly after boot, then once a day. */
export function initQuotationExpiryAlerts(): void {
  if (timer) return;
  const run = () => runQuotationExpiryAlerts().catch((err) => logger.error({ err }, '[QuotationExpiry] Alert run failed'));
  setTimeout(run, 6 * 60_000).unref?.();
  timer = setInterval(run, DAY);
  timer.unref?.();
}
