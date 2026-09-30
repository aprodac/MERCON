import { prisma } from '../db';
import { logger } from './logger';
import { syncExpenseLedger } from './expenseLedger';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAINTENANCE -> EXPENSE AUTOMATIC REFLECTION SYSTEM (3 R's Implementation)
 * Synchronizes Vehicle Maintenance records directly into the Expenses ledger.
 * 
 *  - Readability: Clean, explicit mapping between Maintenance and Expense models.
 *  - Reusability: Callable on maintenance create, update, delete, and list queries.
 *  - Refactoring & Robustness: Prevents duplicate expenses and guarantees financial integrity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function syncSingleMaintenanceExpense(maintenanceId: string): Promise<void> {
  try {
    const record = await prisma.maintenanceRecord.findUnique({
      where: { id: maintenanceId },
      include: { vehicle: true },
    });

    if (!record) return;

    const expRefId = `EXP-MNT-${record.ref_id || record.id.slice(0, 6)}`;
    const mntTag = `[MNT-${record.ref_id || record.id.slice(0, 6)}]`;

    // If maintenance record is deleted, delete corresponding expense
    if (record.deletedAt) {
      await prisma.expense.updateMany({
        where: {
          category: 'Maintenance',
          OR: [{ ref_id: expRefId }, { description: { contains: mntTag } }],
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
      const gone = await prisma.expense.findMany({ where: { category: 'Maintenance', OR: [{ ref_id: expRefId }, { description: { contains: mntTag } }] }, select: { id: true } });
      for (const g of gone) await syncExpenseLedger(g.id);
      return;
    }

    const amount = Number(record.cost) || 0;
    const vatAmount = Number(record.vat_amount) || 0;
    // Paid only once the work is done and the workshop is marked paid; otherwise it's owed
    const status = record.status === 'Completed' && record.payment_status !== 'Pending' ? 'Paid' : 'Pending';
    const paymentAccountId = status === 'Paid' ? record.paymentAccountId : null;
    const payee = record.workshop_name?.trim() || 'Maintenance Workshop';
    const expenseDate = record.start_date || record.service_date || record.createdAt || new Date();
    const vehiclePlate = record.vehicle?.plate_number ? ` (${record.vehicle.plate_number})` : '';
    const description = `${mntTag} ${record.maintenance_type || 'Repair'}: ${record.work_done || record.remarks || 'Vehicle Maintenance'}${vehiclePlate}`;

    // Find existing matching expense record (active or soft-deleted)
    const existingExpense = await prisma.expense.findFirst({
      where: {
        category: 'Maintenance',
        OR: [{ ref_id: expRefId }, { description: { contains: mntTag } }],
      },
    });

    if (existingExpense) {
      // If the expense was soft-deleted by user, do not resurrect or recreate it
      if (existingExpense.deletedAt) {
        return;
      }
      // Runs on every expenses list load: only touch the row (and the ledger) when something changed
      const changed =
        Number(existingExpense.amount) !== amount ||
        Number(existingExpense.vat_amount) !== vatAmount ||
        existingExpense.paymentAccountId !== paymentAccountId ||
        existingExpense.status !== status ||
        existingExpense.payee !== payee ||
        existingExpense.vehicleId !== record.vehicleId ||
        existingExpense.expense_date.getTime() !== new Date(expenseDate).getTime() ||
        existingExpense.description !== description;
      if (!changed) return;
      await prisma.expense.update({
        where: { id: existingExpense.id },
        data: {
          amount,
          vat_amount: vatAmount,
          paymentAccountId,
          status,
          payee,
          vehicleId: record.vehicleId,
          expense_date: expenseDate,
          description,
        },
      });
      await syncExpenseLedger(existingExpense.id);
    } else {
      const created = await prisma.expense.create({
        data: {
          ref_id: expRefId,
          category: 'Maintenance',
          status,
          vehicleId: record.vehicleId,
          payee,
          amount,
          vat_amount: vatAmount,
          paymentAccountId,
          currency: 'SAR',
          expense_date: expenseDate,
          description,
          created_by: record.created_by,
        },
      });
      await syncExpenseLedger(created.id);
    }
  } catch (error) {
    logger.error({ err: error, maintenanceId }, 'Failed to sync maintenance record to expenses');
  }
}

/**
 * Sweeps all active Maintenance Records and ensures every record is present in the Expenses table.
 */
export async function syncAllMaintenanceRecordsToExpenses(): Promise<void> {
  try {
    const allRecords = await prisma.maintenanceRecord.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const rec of allRecords) {
      await syncSingleMaintenanceExpense(rec.id);
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to sweep and sync maintenance records to expenses');
  }
}
