import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { nextMaintenanceRefId } from './maintenanceController';
import { nextExpenseRefId } from './expenseController';
import { getEnabledModules } from './settingsController';
import { isFinanciallyProtectedTrip } from './tripController';
import { generateRefId } from '../utils/refId';

// Which toggleable module a trash entity type belongs to. Customer/Driver/
// Vehicle/Trip/RateCard aren't here — they're core, always available in trash
// regardless of Settings.enabledModules.
const ENTITY_MODULE: Record<string, string> = {
  MaintenanceRecord: 'maintenance',
  Expense: 'expenses',
};

export async function getTrashItems(req: Request, res: Response) {
  try {
    const enabledModules = await getEnabledModules();
    const [customers, drivers, vehicles, trips, maintenance, rateCards, expenses, locations] = await Promise.all([
      prisma.customer.findMany({ where: { deletedAt: { not: null } } }),
      prisma.driver.findMany({ where: { deletedAt: { not: null } } }),
      prisma.vehicle.findMany({ where: { deletedAt: { not: null } } }),
      prisma.trip.findMany({ where: { deletedAt: { not: null } } }),
      enabledModules.has('maintenance') ? prisma.maintenanceRecord.findMany({ where: { deletedAt: { not: null } } }) : Promise.resolve([]),
      prisma.quotation.findMany({ where: { deletedAt: { not: null } } }),
      enabledModules.has('expenses') ? prisma.expense.findMany({ where: { deletedAt: { not: null } } }) : Promise.resolve([]),
      prisma.location.findMany({ where: { deletedAt: { not: null } } }),
    ]);

    const trashItems: any[] = [
      ...customers.map(c => ({ id: c.id, type: 'Customer', name: c.name, deletedAt: c.deletedAt })),
      ...drivers.map(d => ({ id: d.id, type: 'Driver', name: `${d.first_name} ${d.last_name}`, deletedAt: d.deletedAt })),
      ...vehicles.map(v => ({ id: v.id, type: 'Vehicle', name: v.plate_number, deletedAt: v.deletedAt })),
      ...trips.map(t => ({ id: t.id, type: 'Trip', name: t.ref_id || 'Draft', deletedAt: t.deletedAt })),
      ...maintenance.map(m => ({ id: m.id, type: 'MaintenanceRecord', name: `Workshop: ${m.workshop_name} (Cost: SAR ${m.cost})`, deletedAt: m.deletedAt })),
      ...rateCards.map(r => ({ id: r.id, type: 'Quotation', name: `${r.name || 'Quotation'} (${r.rate} ${r.currency})`, deletedAt: r.deletedAt })),
      ...expenses.map(e => ({ id: e.id, type: 'Expense', name: `${e.category} (${e.currency} ${e.amount})`, deletedAt: e.deletedAt })),
      ...locations.map(l => ({ id: l.id, type: 'Location', name: `${l.code} — ${l.name}`, deletedAt: l.deletedAt })),
    ];

    // Sort newest deletions first
    trashItems.sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime());

    res.json({ success: true, data: trashItems });
  } catch (error: any) {
    logger.error('Error fetching trash items:', error);
    res.status(500).json({ error: { message: 'Failed to fetch trash items' } });
  }
}

export async function restoreTrashItem(req: Request, res: Response) {
  const type = req.params.type as string;
  const id = req.params.id as string;
  try {
    const requiredModule = ENTITY_MODULE[type];
    if (requiredModule && !(await getEnabledModules()).has(requiredModule)) {
      return res.status(403).json({ success: false, error: { code: 'MODULE_DISABLED', message: `The "${requiredModule}" module is not enabled on this deployment` } });
    }
    switch (type) {
      case 'Customer':
        await prisma.customer.update({ where: { id }, data: { deletedAt: null } });
        break;
      case 'Driver':
        await prisma.driver.update({ where: { id }, data: { deletedAt: null } });
        break;
      case 'Vehicle':
        await prisma.vehicle.update({ where: { id }, data: { deletedAt: null } });
        break;
      case 'Trip': {
        const existingTrip = await prisma.trip.findUnique({ where: { id }, select: { ref_id: true } });
        let restoredRefId = existingTrip?.ref_id;
        if (!restoredRefId || restoredRefId.startsWith('TRP-DEL-')) {
          restoredRefId = await generateRefId('TRP', () =>
            prisma.trip.findMany({ where: { deletedAt: null }, select: { ref_id: true } }));
        }
        await prisma.trip.update({
          where: { id },
          data: {
            deletedAt: null,
            deleted_by: null,
            isActive: true,
            ref_id: restoredRefId,
          },
        });
        break;
      }
      case 'MaintenanceRecord': {
        // Deleting a service order releases its ref_id so the sequence stays
        // gapless, so a restored order needs a fresh number at the end.
        const restored = await prisma.maintenanceRecord.findUnique({ where: { id } });
        await prisma.maintenanceRecord.update({
          where: { id },
          data: {
            deletedAt: null,
            ...(restored?.ref_id ? {} : { ref_id: await nextMaintenanceRefId() }),
          },
        });
        break;
      }

      case 'RateCard':
      case 'PricingRule':
      case 'Quotation':
        await prisma.quotation.update({ where: { id }, data: { deletedAt: null } });
        break;
      case 'Expense': {
        // Deleting an expense releases its ref_id so the sequence stays
        // gapless, so a restored expense needs a fresh number at the end.
        const restored = await prisma.expense.findUnique({ where: { id } });
        await prisma.expense.update({
          where: { id },
          data: {
            deletedAt: null,
            ...(restored?.ref_id ? {} : { ref_id: await nextExpenseRefId() }),
          },
        });
        break;
      }
      case 'Location':
        await prisma.location.update({ where: { id }, data: { deletedAt: null } });
        break;
      default:
        return res.status(400).json({ error: { message: 'Invalid entity type for restoration' } });
    }
    logger.info(`♻️ Restored ${type} with ID ${id}`);
    res.json({ success: true, message: `${type} restored successfully` });
  } catch (error: any) {
    logger.error(`Error restoring ${type} with ID ${id}:`, error);
    res.status(500).json({ error: { message: `Failed to restore ${type}` } });
  }
}

async function deleteEntityDocuments(entityType: string, entityId: string | string[]) {
  const ids = Array.isArray(entityId) ? entityId : [entityId];
  if (ids.length === 0) return;
  const docs = await prisma.document.findMany({
    where: { entity_type: entityType, entity_id: { in: ids } },
    select: { id: true },
  });
  if (docs.length > 0) {
    const docIds = docs.map(d => d.id);
    await prisma.documentFile.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.document.deleteMany({ where: { id: { in: docIds } } });
  }
}

export async function hardDeleteTrashItem(req: Request, res: Response) {
  const type = req.params.type as string;
  const id = req.params.id as string;
  try {
    const requiredModule = ENTITY_MODULE[type];
    if (requiredModule && !(await getEnabledModules()).has(requiredModule)) {
      return res.status(403).json({ success: false, error: { code: 'MODULE_DISABLED', message: `The "${requiredModule}" module is not enabled on this deployment` } });
    }
    switch (type) {
      case 'Customer': {
        const customerTrips = await prisma.trip.findMany({
          where: { customerId: id },
          select: { id: true, ref_id: true, status: true, is_post_trip_settled: true, paid_amount: true },
        });
        const protectedTrips = customerTrips.filter(t => isFinanciallyProtectedTrip(t));
        if (protectedTrips.length > 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'PROTECTED_TRIP',
              message: `Customer cannot be permanently deleted because it has ${protectedTrips.length} invoiced or financially settled trip(s).`,
            },
          });
        }
        const tripIds = customerTrips.map(t => t.id);
        if (tripIds.length > 0) {
          await prisma.tripCharge.deleteMany({ where: { tripId: { in: tripIds } } });
          await prisma.tripStop.deleteMany({ where: { tripId: { in: tripIds } } });
          await deleteEntityDocuments('Trip', tripIds);
          await prisma.trip.deleteMany({ where: { customerId: id } });
        }
        await prisma.location.deleteMany({ where: { customerId: id } });
        await prisma.surchargeRule.deleteMany({ where: { customerId: id } });
        await prisma.quotation.deleteMany({ where: { customerId: id } });
        await deleteEntityDocuments('Customer', id);
        await prisma.customer.deleteMany({ where: { id } });
        break;
      }
      case 'Driver':
        await deleteEntityDocuments('Driver', id);
        await prisma.driver.deleteMany({ where: { id } });
        break;
      case 'Vehicle':
        await prisma.maintenanceRecord.deleteMany({ where: { vehicleId: id } });
        await deleteEntityDocuments('Vehicle', id);
        await prisma.vehicle.deleteMany({ where: { id } });
        break;
      case 'Trip': {
        const trip = await prisma.trip.findUnique({
          where: { id },
          select: { id: true, ref_id: true, status: true, is_post_trip_settled: true, paid_amount: true },
        });
        if (trip && isFinanciallyProtectedTrip(trip)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'PROTECTED_TRIP',
              message: `Trip ${trip.ref_id || id} cannot be permanently deleted because it is invoiced or financially settled.`,
            },
          });
        }
        // Cascade delete dependent records first to prevent foreign key errors
        await prisma.tripCharge.deleteMany({ where: { tripId: id } });
        await prisma.tripStop.deleteMany({ where: { tripId: id } });
        await deleteEntityDocuments('Trip', id);
        await prisma.trip.deleteMany({ where: { id } });
        break;
      }
      case 'MaintenanceRecord':
        await deleteEntityDocuments('MaintenanceRecord', id);
        await prisma.maintenanceRecord.deleteMany({ where: { id } });
        break;
      case 'RateCard':
      case 'PricingRule':
      case 'Quotation':
        await prisma.quotationStop.deleteMany({ where: { quotationId: id } });
        await prisma.quotationHistory.deleteMany({ where: { quotationId: id } });
        await prisma.quotation.deleteMany({ where: { id } });
        break;
      case 'Expense':
        await prisma.expense.deleteMany({ where: { id } });
        break;
      case 'Location':
        await prisma.location.deleteMany({ where: { id } });
        break;
      default:
        return res.status(400).json({ error: { message: 'Invalid entity type for permanent deletion' } });
    }
    logger.info(`🔥 Permanently deleted ${type} with ID ${id}`);
    res.json({ success: true, message: `${type} permanently deleted` });
  } catch (error: any) {
    logger.error(`Error hard-deleting ${type} with ID ${id}:`, error);
    res.status(500).json({ error: { message: `Failed to permanently delete ${type}` } });
  }
}
