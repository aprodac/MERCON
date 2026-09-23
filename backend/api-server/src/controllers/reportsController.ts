import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../db';
import { TripStatus, DriverStatus, AssetStatus } from '@prisma/client';
import { getEnabledModules } from './settingsController';
import { computeTripChargesTotal } from '../utils/tripFinancials';

/* ─── Dashboard summary KPIs ──────────────────────────────────────────────── */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const enabledModules = await getEnabledModules();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalTripsThisMonth,
      totalTripsLastMonth,
      activeDrivers,
      availableVehicles,
      onTripVehicles,
      revenueThisMonth,
      revenueLastMonth,
      tripsByStatus,
      docsExpiringIn30Days
    ] = await Promise.all([
      // Total trips this month
      prisma.trip.count({ where: { deletedAt: null, createdAt: { gte: startOfMonth } } }),
      // Total trips last month (for delta)
      prisma.trip.count({ where: { deletedAt: null, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      // Active drivers
      prisma.driver.count({ where: { deletedAt: null, isActive: true, status: DriverStatus.Available } }),
      // Available vehicles
      prisma.vehicle.count({ where: { deletedAt: null, isActive: true, status: AssetStatus.Available } }),
      // On-trip vehicles
      prisma.vehicle.count({ where: { deletedAt: null, isActive: true, status: AssetStatus.OnTrip } }),
      // Revenue this month (completed trips)
      prisma.trip.aggregate({
        where: { deletedAt: null, status: TripStatus.Completed, createdAt: { gte: startOfMonth } },
        _sum: { billing_amount: true }
      }),
      // Revenue last month
      prisma.trip.aggregate({
        where: { deletedAt: null, status: TripStatus.Completed, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { billing_amount: true }
      }),
      // Trip distribution by status
      prisma.trip.groupBy({
        by: ['status'],
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
        _count: { status: true }
      }),
      // Documents expiring within 30 days (including already expired requiring renewal)
      prisma.document.count({
        where: {
          deletedAt: null,
          expiry_date: { lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    let recentMonthlyRevenue: { month: string; revenue: number }[] = [];
    try {
      recentMonthlyRevenue = await prisma.$queryRaw<{ month: string; revenue: number }[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', "createdAt"), 'Mon') AS month,
          COALESCE(SUM("billing_amount"), 0)::float8 AS revenue
        FROM "Trip"
        WHERE "deletedAt" IS NULL
          AND status IN ('Completed', 'Invoiced')
          AND "createdAt" >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY DATE_TRUNC('month', "createdAt") ASC
      `;
    } catch (err) {
      logger.warn({ err }, 'Failed to compute monthly revenue chart query');
    }

    // Invoice-derived and document-derived fields go to null rather than
    // being computed when their module is off — that module's data still
    // exists in the DB, it's just not this deployment's business to surface.
    const invoicesOn = enabledModules.has('invoices');
    const documentsOn = enabledModules.has('documents');

    const revenueNow = Number(revenueThisMonth._sum.billing_amount ?? 0);
    const revenuePrev = Number(revenueLastMonth._sum.billing_amount ?? 0);
    const tripsDelta = totalTripsLastMonth > 0
      ? Math.round(((totalTripsThisMonth - totalTripsLastMonth) / totalTripsLastMonth) * 100)
      : 0;
    const revenueDelta = revenuePrev > 0
      ? Math.round(((revenueNow - revenuePrev) / revenuePrev) * 100)
      : 0;

    // Build status distribution map
    const statusMap: Record<string, number> = {};
    tripsByStatus.forEach((row) => { statusMap[row.status] = row._count.status; });

    res.json({
      success: true,
      data: {
        kpis: {
          total_trips: { value: totalTripsThisMonth, delta: tripsDelta },
          active_drivers: { value: activeDrivers, delta: null },
          fleet_available: { value: availableVehicles, delta: null },
          fleet_on_trip: { value: onTripVehicles, delta: null },
          revenue_this_month: invoicesOn ? { value: revenueNow, delta: revenueDelta } : null,
          docs_expiring_soon: documentsOn ? { value: docsExpiringIn30Days, delta: null } : null
        },
        trip_status_distribution: statusMap,
        monthly_revenue_chart: invoicesOn ? recentMonthlyRevenue : null
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Reports summary error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to generate summary report' } });
  }
};

/* ─── Fleet performance ───────────────────────────────────────────────────── */
export const getFleetPerformance = async (req: Request, res: Response) => {
  try {
    const enabledModules = await getEnabledModules();
    const maintenanceOn = enabledModules.has('maintenance');
    const { startDate, endDate, page = '1', per_page = '10' } = req.query;
    
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(per_page as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build trips condition based on date filters
    const tripsCondition: any = { deletedAt: null };
    if (startDate) {
      tripsCondition.createdAt = { ...tripsCondition.createdAt, gte: new Date(startDate as string) };
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      tripsCondition.createdAt = { ...tripsCondition.createdAt, lte: end };
    }

    const [total, vehicles] = await Promise.all([
      prisma.vehicle.count({ where: { deletedAt: null } }),
      prisma.vehicle.findMany({
        where: { deletedAt: null },
        skip,
        take: limitNum,
        include: {
          trips: {
            where: tripsCondition,
            select: { status: true, actual_start: true, actual_end: true }
          },
          maintenanceRecords: {
            where: { deletedAt: null },
            select: { cost: true, service_date: true }
          }
        }
      })
    ]);

    const data = vehicles.map((v) => ({
      id: v.id,
      ref_id: v.ref_id,
      plate_number: v.plate_number,
      status: v.status,
      total_trips: v.trips.length,
      completed_trips: v.trips.filter((t) => t.status === TripStatus.Completed).length,
      odometer: v.current_odometer,
      maintenance_cost: maintenanceOn ? v.maintenanceRecords.reduce((sum, m) => sum + Number(m.cost), 0) : null
    }));

    res.json({
      success: true,
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get fleet performance' } });
  }
};

/* ─── Driver performance ──────────────────────────────────────────────────── */
export const getDriverPerformance = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, page = '1', per_page = '10' } = req.query;
    
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(per_page as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build trips condition based on date filters
    const tripsCondition: any = { deletedAt: null };
    if (startDate) {
      tripsCondition.createdAt = { ...tripsCondition.createdAt, gte: new Date(startDate as string) };
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      tripsCondition.createdAt = { ...tripsCondition.createdAt, lte: end };
    }

    const [total, drivers] = await Promise.all([
      prisma.driver.count({ where: { deletedAt: null } }),
      prisma.driver.findMany({
        where: { deletedAt: null },
        skip,
        take: limitNum,
        include: {
          trips: {
            where: tripsCondition,
            select: { status: true, actual_start: true, actual_end: true, planned_start: true, planned_end: true }
          }
        }
      })
    ]);

    const data = drivers.map((d) => {
      const completed = d.trips.filter((t) => t.status === TripStatus.Completed);
      return {
        id: d.id,
        ref_id: d.ref_id,
        name: `${d.first_name} ${d.last_name}`,
        status: d.status,
        total_trips: d.trips.length,
        completed_trips: completed.length
      };
    });

    res.json({
      success: true,
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get driver performance' } });
  }
};

/* ─── Revenue report ──────────────────────────────────────────────────────── */
export const getRevenueReport = async (req: Request, res: Response) => {
  try {
    const { months = '6' } = req.query;
    const monthCount = parseInt(months as string);

    const rows = await prisma.$queryRaw<{ month: string; revenue: number; count: number }[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "createdAt"), 'Mon YYYY') AS month,
        COALESCE(SUM("billing_amount"), 0)::float8 AS revenue,
        COUNT(*)::int AS count
      FROM "Trip"
      WHERE "deletedAt" IS NULL
        AND status IN ('Completed', 'Invoiced')
        AND "createdAt" >= NOW() - (${monthCount} || ' months')::INTERVAL
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt") ASC
    `;

    const totalRevenue = await prisma.trip.aggregate({
      where: { deletedAt: null, status: TripStatus.Completed },
      _sum: { billing_amount: true },
      _count: true
    });

    const outstanding = await prisma.trip.aggregate({
      where: { deletedAt: null, is_post_trip_settled: false },
      _sum: { billing_amount: true }
    });

    // Top customers by revenue
    const grouped = await prisma.trip.groupBy({
      by: ['customerId'],
      where: { deletedAt: null, status: TripStatus.Completed },
      _sum: { billing_amount: true },
      orderBy: { _sum: { billing_amount: 'desc' } },
      take: 5
    });
    const customers = await prisma.customer.findMany({
      where: { id: { in: grouped.map((g: { customerId: string }) => g.customerId) } },
      select: { id: true, name: true }
    });
    const nameById = new Map(customers.map((c) => [c.id, c.name]));
    const top_customers = grouped.map((g: { customerId: string; _sum: { billing_amount: any } }) => ({
      id: g.customerId,
      name: nameById.get(g.customerId) ?? 'Unknown',
      value: Number(g._sum.billing_amount ?? 0)
    }));

    const paidCount = totalRevenue._count;
    const paidTotal = Number(totalRevenue._sum.billing_amount ?? 0);

    res.json({
      success: true,
      data: {
        monthly_breakdown: rows,
        total_all_time: paidTotal,
        outstanding_total: outstanding._sum.billing_amount ?? 0,
        paid_invoice_count: paidCount,
        avg_per_invoice: paidCount > 0 ? paidTotal / paidCount : 0,
        top_customers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get revenue report' } });
  }
};

/* ─── Custom report ───────────────────────────────────────────────────────── */
export const getCustomReport = async (req: Request, res: Response) => {
  try {
    const enabledModules = await getEnabledModules();
    const invoicesOn = enabledModules.has('invoices');
    const { startDate, endDate, customerId } = req.query;

    // Filter on the trip's own date, not createdAt (a trip created in July
    // for a June job should show up in June's report), falling back to
    // planned_start for trips that haven't actually started yet.
    const dateRange: { gte?: Date; lte?: Date } = {};
    if (startDate) dateRange.gte = new Date(startDate as string);
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateRange.lte = end;
    }

    const whereClause: any = { deletedAt: null };
    if (Object.keys(dateRange).length > 0) {
      whereClause.OR = [
        { actual_start: dateRange },
        { AND: [{ actual_start: null }, { planned_start: dateRange }] },
      ];
    }
    if (customerId && customerId !== 'all') {
      whereClause.customerId = customerId;
    }

    const tripInclude = {
      customer: { select: { name: true } },
      driver: { select: { first_name: true, last_name: true, phone_primary: true } },
      vehicle: { select: { plate_number: true, capacity_kg: true, asset_type: true } },
      stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' as const } },
      charges: true,
    };

    // No row cap — page internally so a full month's ledger exports
    // completely instead of silently truncating at a fixed limit.
    const PAGE_SIZE = 1000;
    const allTrips: any[] = [];
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const page = await prisma.trip.findMany({
        where: whereClause,
        orderBy: [{ actual_start: 'desc' }, { planned_start: 'desc' }],
        skip,
        take: PAGE_SIZE,
        include: tripInclude,
      });
      allTrips.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const totalTrips = allTrips.length;
    const statusMap: Record<string, number> = {};
    for (const t of allTrips) statusMap[t.status] = (statusMap[t.status] ?? 0) + 1;

    let totalRevenue: number | null = null;
    const revenueAgg = await prisma.trip.aggregate({
      where: { ...whereClause, status: TripStatus.Completed },
      _sum: { billing_amount: true }
    });
    totalRevenue = Number(revenueAgg._sum.billing_amount ?? 0);

    res.json({
      success: true,
      data: {
        kpis: {
          total_trips: totalTrips,
          total_revenue: totalRevenue,
        },
        trip_status_distribution: statusMap,
        trips: allTrips.map(t => {
          const dropoff = t.stops.find((s: any) => s.stop_type === 'Dropoff');
          const billing = Number(t.billing_amount ?? 0);
          const chargesTotal = computeTripChargesTotal(t.charges);
          const totalAmt = billing + chargesTotal;
          const driverCharge = Number((t as any).driver_payout ?? t.driver_charge ?? 0);
          const balance = totalAmt - (chargesTotal + driverCharge);
          const vehicleTypeLabel = t.vehicle ? `${(t.vehicle.capacity_kg / 1000).toFixed(0)} TON (${t.vehicle.asset_type})` : 'N/A';

          return {
            id: t.id,
            ref_id: t.ref_id,
            date: t.actual_start || t.planned_start || t.createdAt,
            driver: t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'N/A',
            driver_phone: t.driver?.phone_primary || 'N/A',
            vehicle: t.vehicle?.plate_number || 'N/A',
            vehicle_type: vehicleTypeLabel,
            carrier_name: t.carrier_name || 'MERCON LOGISTICS',
            customer: t.customer?.name || 'N/A',
            receiver: dropoff?.location_name || dropoff?.location_address || 'N/A',
            total_charges: chargesTotal,
            charges: t.charges,
            billing_amount: billing,
            total_amount: totalAmt,
            driver_payout: driverCharge,
            trip_charges: driverCharge,
            driver_charge: driverCharge,
            balance_amount: balance,
            company_name: t.customer?.name || 'MERCON',
            status: t.status,
            is_post_trip_settled: t.is_post_trip_settled
          };
        })
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Custom report error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to generate custom report' } });
  }
};

