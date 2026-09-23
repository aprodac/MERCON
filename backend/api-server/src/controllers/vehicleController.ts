import { Request, Response } from 'express';
import { prisma } from '../db';
import { DOCUMENT_LIST_SELECT, DOCUMENT_FILES_SELECT } from '../utils/documentSelect';
import { generateRefId } from '../utils/refId';
import { buildSearchAnd } from '../utils/search';
import { AssetStatus, AssetType } from '@prisma/client';
import { tripIncome, isEarned } from '../reportEngine/derived';
import { getEnabledModules } from './settingsController';
import { resolveVehicleLocation } from '../services/locationResolver';

// Trip statuses that mean the trip is still in progress — mirrors the
// active-set convention already used in thirdPartyController.ts's
// activeTripsCount. A vehicle/driver on one of these can't be deleted.
const ACTIVE_TRIP_STATUSES = ['Scheduled', 'Loading', 'InTransit', 'Delayed'];

/** Fields the fleet ledger search bar looks at. */
const VEHICLE_SEARCH_FIELDS = [
  'plate_number',
  'ref_id',
  'trailer_number',
  'icces_device_id',
  'assignedDriver.first_name',
  'assignedDriver.last_name',
  'assignedDriver.phone_primary',
  'assignedDriver.license_number',
  'assignedDriver.ref_id',
];

export const getVehicles = async (req: Request, res: Response) => {
  try {
    const { status, search, page = '1', per_page = '20' } = req.query;
    
    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = { deletedAt: null };
    if (status) {
      whereClause.status = status as AssetStatus;
    }
    // Asset type is an enum column, so it can't be matched with `contains` —
    // the typed word is resolved to the matching enum values instead.
    const searchAnd = buildSearchAnd(search, VEHICLE_SEARCH_FIELDS, {
      extraClausesForToken: (token) => {
        const matchingAssetTypes = Object.values(AssetType).filter((t) =>
          t.toLowerCase().includes(token.toLowerCase())
        );
        return matchingAssetTypes.length > 0 ? [{ asset_type: { in: matchingAssetTypes } }] : [];
      },
    });
    if (searchAnd.length > 0) {
      whereClause.AND = searchAnd;
    }

    if (req.query.mode === 'kpi') {
      const groups = await prisma.vehicle.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: {
          id: true
        }
      });

      let total = 0;
      let available = 0;
      let onTrip = 0;
      let maintenance = 0;

      for (const group of groups) {
        total += group._count.id;
        if (group.status === 'Available') available = group._count.id;
        if (group.status === 'OnTrip') onTrip = group._count.id;
        if (group.status === 'Maintenance') maintenance = group._count.id;
      }

      return res.json({
        success: true,
        data: {
          total,
          available,
          onTrip,
          maintenance
        }
      });
    }

    if (req.query.mode === 'lookup') {
      const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          // Picker shape — see the matching note in driverController. Scalars a
          // dropdown / export column needs plus a shallow assigned-driver join,
          // and crucially no `trips` / `maintenanceRecords` includes.
          select: {
            id: true,
            plate_number: true,
            ref_id: true,
            image_url: true,
            trailer_number: true,
            trailer_type: true,
            asset_type: true,
            status: true,
            capacity_kg: true,
            current_odometer: true,
            icces_device_id: true,
            createdAt: true,
            last_lat: true,
            last_lng: true,
            last_seen_at: true,
            last_speed_kph: true,
            last_heading: true,
            last_status: true,
            assignedDriver: {
              select: { id: true, ref_id: true, first_name: true, last_name: true, phone_primary: true, avatar_url: true }
            }
          }
        }),
        prisma.vehicle.count({ where: whereClause })
      ]);

      return res.json({
        success: true,
        data: vehicles,
        meta: {
          page: pageNumber,
          per_page: limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    }

    const now = new Date();
    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedDriver: {
            select: { id: true, first_name: true, last_name: true, phone_primary: true, avatar_url: true }
          },
          trips: {
            where: {
              deletedAt: null,
              status: {
                in: ['Scheduled', 'Loading', 'InTransit', 'Delayed'] as any[]
              }
            },
            include: {
              driver: {
                select: { id: true, first_name: true, last_name: true, phone_primary: true, avatar_url: true }
              },
              customer: { select: { name: true } },
              stops: {
                select: { stop_type: true, location_name: true, location_address: true, stop_sequence: true },
                orderBy: { stop_sequence: 'asc' },
              },
            },
            orderBy: {
              planned_start: 'asc'
            }
          },
          maintenanceRecords: {
            where: {
              deletedAt: null,
              OR: [
                { status: { in: ['In_Progress', 'In Progress'] } },
                {
                  status: 'Scheduled',
                  start_date: { lte: now },
                  OR: [
                    { end_date: null },
                    { end_date: { gte: now } },
                  ],
                },
                // Also include future Scheduled so UI can show upcoming notice
                { status: 'Scheduled', start_date: { gt: now } },
              ],
            },
            orderBy: { start_date: 'asc' },
            select: {
              id: true,
              status: true,
              maintenance_type: true,
              workshop_name: true,
              start_date: true,
              end_date: true,
            },
          },
        }
      }),
      prisma.vehicle.count({ where: whereClause })
    ]);

    // Attach active_maintenance and resolved_location as computed fields
    const vehiclesWithResolvedLocation = await Promise.all(
      vehicles.map(async (v: any) => {
        const records: any[] = v.maintenanceRecords || [];
        const active =
          records.find((r: any) => r.status === 'In_Progress' || r.status === 'In Progress') ??
          records.find((r: any) => r.status === 'Scheduled' && new Date(r.start_date) <= now && (!r.end_date || new Date(r.end_date) >= now)) ??
          records.find((r: any) => r.status === 'Scheduled') ??
          null;
        const { maintenanceRecords: _mr, ...rest } = v;
        const resolved_location = await resolveVehicleLocation(v, prisma);
        return { ...rest, active_maintenance: active ?? null, resolved_location };
      })
    );

    res.json({
      success: true,
      data: vehiclesWithResolvedLocation,
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch vehicles' } });
  }
};

export const getVehicleById = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const idOrRef = req.params.id as string;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
    const whereClause: any = isUuid
      ? { id: idOrRef, deletedAt: null }
      : {
          OR: [
            { ref_id: idOrRef },
            { ref_id: { equals: idOrRef, mode: 'insensitive' } },
            { plate_number: idOrRef },
            { plate_number: { equals: idOrRef, mode: 'insensitive' } },
          ],
          deletedAt: null,
        };

    // `mode=lookup` returns the vehicle without its trip history — see the note
    // on the driver equivalent. The documents page renders a plate number.
    const vehicle = req.query.mode === 'lookup'
      ? await prisma.vehicle.findFirst({
          where: whereClause,
          include: { assignedDriver: { select: { id: true, first_name: true, last_name: true, phone_primary: true } } },
        })
      : await prisma.vehicle.findFirst({
      where: whereClause,
      include: {
        assignedDriver: { select: { id: true, first_name: true, last_name: true, phone_primary: true } },
        trips: {
          where: {
            deletedAt: null,
            status: {
              notIn: ['Cancelled']
            }
          },
          include: {
            driver: { select: { id: true, first_name: true, last_name: true, phone_primary: true } },
            customer: true,
            stops: { where: { deletedAt: null }, orderBy: { stop_sequence: 'asc' } }
          },
          orderBy: {
            planned_start: 'desc'
          },
          take: 100
        },
        maintenanceRecords: {
          where: {
            deletedAt: null,
            OR: [
              { status: { in: ['In_Progress', 'In Progress'] } },
              { status: 'Scheduled' },
            ],
          },
          orderBy: { start_date: 'asc' },
          select: {
            id: true,
            status: true,
            maintenance_type: true,
            workshop_name: true,
            start_date: true,
            end_date: true,
          },
        },
      }
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });
    }

    // Fetch documents manually because of polymorphic relation
    const documents = await prisma.document.findMany({
      where: { entity_type: 'Vehicle', entity_id: vehicle.id, deletedAt: null },
      select: DOCUMENT_LIST_SELECT,
    });

    const records: any[] = (vehicle as any).maintenanceRecords || [];
    const active =
      records.find((r: any) => r.status === 'In_Progress' || r.status === 'In Progress') ??
      records.find((r: any) => r.status === 'Scheduled' && new Date(r.start_date) <= now && (!r.end_date || new Date(r.end_date) >= now)) ??
      records.find((r: any) => r.status === 'Scheduled') ??
      null;

    const { maintenanceRecords: _mr, ...vehicleData } = vehicle as any;
    const resolved_location = await resolveVehicleLocation(vehicle, prisma);
    res.json({ success: true, data: { ...vehicleData, documents, active_maintenance: active ?? null, resolved_location } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch vehicle' } });
  }
};

function normalizeAssetType(raw: any): AssetType {
  const str = String(raw || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (str.includes('BOX')) return AssetType.Box;
  if (str.includes('REEFER') || str.includes('COLD') || str.includes('FRIDGE')) return AssetType.Reefer;
  if (str.includes('TANK')) return AssetType.Tanker;
  if (str.includes('FLAT') || str.includes('BED')) return AssetType.Flatbed;
  return AssetType.Box;
}

function cleanString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  const lower = str.toLowerCase();
  if (!str || ['nil', 'nill', 'none', 'n/a', 'na', 'null', 'undefined', '-', '0'].includes(lower)) {
    return null;
  }
  return str;
}

function cleanNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Bulk-import vehicles from the fleet workbook.
 *
 * Same two-pass shape as the driver import, and for the same reason: the two
 * sheets reference each other, so whichever goes first has dangling references.
 * Pass 1 upserts the trucks on `plate_number` (the unique column, so a
 * re-upload corrects rather than duplicates); pass 2 links each truck to its
 * driver, matched by phone first and falling back to full name.
 *
 * Status is never written. A re-import must not flip a truck that is out on a
 * job back to Available.
 */
export const bulkImportVehicles = async (req: Request, res: Response) => {
  try {
    const { rows } = req.body as {
      rows: Array<{
        ref_id?: string;
        plate_number: string;
        asset_type: string;
        capacity_kg: number | string;
        current_odometer?: number | string;
        icces_device_id?: string | number;
        trailer_number?: string;
        trailer_type?: string;
        trailer_capacity_kg?: number | string;
        assigned_driver?: string;
      }>;
    };
    const userId = (req as any).user?.id;
    const results: Array<{
      row: number; success: boolean; ref_id?: string; label?: string;
      action?: 'created' | 'updated'; error?: string; warning?: string;
    }> = [];

    // Pass 1 — the trucks.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      const plate = String(row.plate_number || '').trim();

      if (!plate) {
        results.push({ row: rowNumber, success: false, error: 'Plate number is required' });
        continue;
      }

      try {
        let existing = await prisma.vehicle.findFirst({
          where: { plate_number: { equals: plate, mode: 'insensitive' } },
        });

        const refIdClean = cleanString(row.ref_id);
        if (!existing && refIdClean) {
          existing = await prisma.vehicle.findFirst({
            where: { ref_id: { equals: refIdClean, mode: 'insensitive' } },
          });
        }

        const iccesDeviceIdClean = cleanString(row.icces_device_id);
        const trailerNumberClean = cleanString(row.trailer_number);
        const trailerTypeClean = row.trailer_type ? normalizeAssetType(row.trailer_type) : null;
        const trailerCapacityKgClean = cleanNumber(row.trailer_capacity_kg);
        const currentOdometerClean = cleanNumber(row.current_odometer);

        const shared = {
          asset_type: normalizeAssetType(row.asset_type),
          capacity_kg: cleanNumber(row.capacity_kg) ?? 10000,
          ...(currentOdometerClean !== null ? { current_odometer: currentOdometerClean } : {}),
          icces_device_id: iccesDeviceIdClean,
          trailer_number: trailerNumberClean,
          trailer_type: trailerTypeClean,
          trailer_capacity_kg: trailerCapacityKgClean,
        };

        if (existing) {
          await prisma.vehicle.update({
            where: { id: existing.id },
            data: {
              plate_number: plate,
              ...shared,
              ...(existing.deletedAt ? { deletedAt: null, deleted_by: null, isActive: true } : {}),
              updated_by: userId,
            },
          });
          results.push({ row: rowNumber, success: true, ref_id: existing.ref_id ?? undefined, label: plate, action: 'updated' });
        } else {
          let ref_id = refIdClean;
          if (!ref_id) {
            ref_id = await generateRefId('TRK', () =>
              prisma.vehicle.findMany({ select: { ref_id: true } }));
          } else {
            // Ensure ref_id isn't collision with existing vehicle
            const refCollision = await prisma.vehicle.findFirst({ where: { ref_id } });
            if (refCollision) {
              ref_id = await generateRefId('TRK', () =>
                prisma.vehicle.findMany({ select: { ref_id: true } }));
            }
          }

          const created = await prisma.vehicle.create({
            data: { ref_id, plate_number: plate, ...shared, created_by: userId },
          });
          results.push({ row: rowNumber, success: true, ref_id: created.ref_id ?? undefined, label: plate, action: 'created' });
        }
      } catch (err: any) {
        const message = err.code === 'P2002'
          ? (err.meta?.target?.includes?.('icces_device_id')
            ? 'That ICCES device ID is already on another vehicle'
            : 'A vehicle with this plate or reference already exists')
          : err.message || 'Could not import this row';
        results.push({ row: rowNumber, success: false, label: plate, error: message });
      }
    }

    // Pass 2 — driver assignments, now that every truck in this file exists.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const whoRaw = cleanString(row.assigned_driver);
      const result = results[i];
      if (!whoRaw || !result?.success) continue;

      const who = whoRaw.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (!who) continue;

      try {
        const digits = who.replace(/\D/g, '');
        let driver = await prisma.driver.findFirst({
          where: { phone_primary: who, deletedAt: null },
        });

        if (!driver && digits.length >= 7) {
          const candidates = await prisma.driver.findMany({
            where: { deletedAt: null, phone_primary: { not: null } },
            select: { id: true, phone_primary: true },
          });
          const hit = candidates.find((c) => {
            const theirs = (c.phone_primary ?? '').replace(/\D/g, '');
            return theirs.endsWith(digits) || digits.endsWith(theirs);
          });
          if (hit) driver = await prisma.driver.findUnique({ where: { id: hit.id } });
        }

        if (!driver) {
          // Try matching by driver ref_id (e.g. DRV-101)
          driver = await prisma.driver.findFirst({
            where: { ref_id: { equals: who, mode: 'insensitive' }, deletedAt: null },
          });
        }

        if (!driver) {
          // Smart fuzzy/prefix name matching for partial names (e.g. "IMTIAZ AHMED" -> "IMTIAZ AHMED KHIZAR HAYAT")
          const allDrivers = await prisma.driver.findMany({ where: { deletedAt: null } });
          const normTarget = who.toLowerCase().replace(/\s+/g, ' ');

          const matches = allDrivers.filter((d) => {
            const fn = (d.first_name || '').toLowerCase().trim();
            const ln = (d.last_name || '').toLowerCase().trim();
            const fullName = `${fn} ${ln}`.replace(/\s+/g, ' ');

            if (fullName.startsWith(normTarget) || normTarget.startsWith(fullName)) return true;

            const targetWords = normTarget.split(' ');
            const fullWords = fullName.split(' ');
            if (targetWords.length > 0 && targetWords.every((tw) => fullWords.some((fw) => fw.startsWith(tw)))) {
              return true;
            }

            return false;
          });

          if (matches.length === 1) {
            driver = matches[0];
          } else if (matches.length > 1) {
            const exactPrefix = matches.filter((d) => {
              const fullName = `${d.first_name} ${d.last_name}`.toLowerCase().replace(/\s+/g, ' ');
              return fullName.startsWith(normTarget);
            });
            if (exactPrefix.length === 1) {
              driver = exactPrefix[0];
            } else {
              result.warning = `Imported, but more than one driver matches "${who}" — assign the truck by phone number or driver ID`;
              continue;
            }
          }
        }

        if (!driver) {
          result.warning = `Imported, but driver "${who}" wasn't found — import the drivers file, then re-upload this one`;
          continue;
        }

        const vehicle = await prisma.vehicle.findFirst({
          where: { plate_number: { equals: String(row.plate_number).trim(), mode: 'insensitive' } },
        });
        if (!vehicle) continue;

        await prisma.driver.update({
          where: { id: driver.id },
          data: { assignedVehicleId: vehicle.id, updated_by: userId },
        });
      } catch (err: any) {
        result.warning = err.code === 'P2002'
          ? `Imported, but ${who} already has a different vehicle assigned`
          : 'Imported, but the driver assignment failed';
      }
    }

    const created = results.filter((r) => r.success && r.action === 'created').length;
    const updated = results.filter((r) => r.success && r.action === 'updated').length;
    const failed = results.filter((r) => !r.success).length;

    res.json({
      success: true,
      data: { total: rows.length, created, updated, failed, results },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to import vehicles' } });
  }
};

export const createVehicle = async (req: Request, res: Response) => {
  try {
    const {
      plate_number,
      asset_type,
      capacity_kg,
      trailer_number,
      trailer_type,
      trailer_capacity_kg,
      icces_device_id,
      image_url
    } = req.body;

    const ref_id = await generateRefId('TRK', () =>
      prisma.vehicle.findMany({ select: { ref_id: true } }));

    const vehicle = await prisma.vehicle.create({
      data: {
        ref_id,
        plate_number,
        asset_type: asset_type as AssetType,
        capacity_kg,
        trailer_number,
        trailer_type: trailer_type ? (trailer_type as AssetType) : null,
        trailer_capacity_kg,
        icces_device_id,
        image_url,
        odometer_updated_at: new Date(),
        created_by: (req as any).user?.id
      }
    });

    res.status(201).json({ success: true, data: vehicle });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'Plate number already exists' } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create vehicle' } });
  }
};

export const updateVehicle = async (req: Request, res: Response) => {
  try {
    const updated = await prisma.vehicle.update({
      where: { id: req.params.id as string },
      data: {
        ...req.body,
        asset_type: req.body.asset_type ? (req.body.asset_type as AssetType) : undefined,
        trailer_type: req.body.trailer_type ? (req.body.trailer_type as AssetType) : undefined,
        // Stamped server-side, not client-supplied, so it always reflects
        // when the reading actually changed.
        odometer_updated_at: req.body.current_odometer !== undefined ? new Date() : undefined,
        updated_by: (req as any).user?.id
      }
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update vehicle' } });
  }
};

export const deleteVehicle = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // A vehicle mid-trip can't be pulled out from under it — the trip would
    // keep resolving the vehicle (soft delete), but the driver/dispatcher
    // would have no signal the truck is gone.
    const activeTrips = await prisma.trip.count({
      where: { vehicleId: id, deletedAt: null, status: { in: ACTIVE_TRIP_STATUSES as any } }
    });
    if (activeTrips > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'IN_USE',
          message: `This vehicle has ${activeTrips} active trip${activeTrips === 1 ? '' : 's'} in progress. Reassign or complete them before deleting.`
        }
      });
    }

    await prisma.$transaction([
      prisma.trip.updateMany({ where: { vehicleId: id }, data: { vehicleId: null } }),
      prisma.expense.updateMany({ where: { vehicleId: id }, data: { vehicleId: null } }),
      prisma.maintenanceRecord.deleteMany({ where: { vehicleId: id } }),
      prisma.driverVehicleAssignment.deleteMany({ where: { vehicleId: id } }),
      prisma.driver.updateMany({ where: { assignedVehicleId: id }, data: { assignedVehicleId: null } }),
      prisma.vehicle.delete({ where: { id } })
    ]);
    res.json({ success: true, data: { message: 'Vehicle permanently deleted successfully' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete vehicle' } });
  }
};

/**
 * Counts for the fleet KPI cards — the vehicle twin of getDriverStats. Replaces
 * a `per_page=1000` fetch of the full vehicle shape (trips + stops + customer +
 * maintenance per row) that ran on every mount of the fleet ledger.
 */
export const getVehicleStats = async (_req: Request, res: Response) => {
  try {
    const where = { deletedAt: null };
    const [byStatus, total] = await Promise.all([
      prisma.vehicle.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.vehicle.count({ where }),
    ]);

    const by_status: Record<string, number> = {};
    for (const row of byStatus) by_status[row.status] = row._count._all;

    res.json({
      success: true,
      data: {
        total,
        by_status,
        available: by_status.Available ?? 0,
        on_trip: by_status.OnTrip ?? 0,
        maintenance: by_status.Maintenance ?? 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to compute vehicle stats' } });
  }
};

/**
 * Computes exact physical GPS status counts and reconciliation for the fleet donut chart.
 * Reconciles: Physical GPS Tracked (27) + Not Connected (4) = MERCON Vehicles (31).
 */
export const getPhysicalGpsStatusSummary = async (_req: Request, res: Response) => {
  try {
    const where = { deletedAt: null };
    const vehicles = await prisma.vehicle.findMany({
      where,
      select: {
        id: true,
        icces_device_id: true,
        last_status: true,
        last_seen_at: true,
      },
    });

    const merconTotal = vehicles.length;
    const connectedVehicles = vehicles.filter((v) => v.icces_device_id && v.icces_device_id.trim() !== '');
    const notConnectedTotal = merconTotal - connectedVehicles.length;
    const physicalGpsTotal = connectedVehicles.length;

    const statusCounts: Record<string, number> = {
      MOVING: 0,
      IDLE: 0,
      STOPPED: 0,
      COMMAND: 0,
      ALERT: 0,
      DEVICE_NO_SIGNAL: 0,
      DEVICE_NOT_WORKING: 0,
      ACCIDENT: 0,
      TAMPER_WEIGHT: 0,
      UNKNOWN: 0,
    };

    for (const v of connectedVehicles) {
      const rawStatus = (v.last_status || 'UNKNOWN').trim().toUpperCase();
      if (rawStatus in statusCounts) {
        statusCounts[rawStatus] += 1;
      } else {
        statusCounts.UNKNOWN += 1;
      }
    }

    const categorySum = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const reconciliationValid = categorySum === physicalGpsTotal;

    res.json({
      success: true,
      data: {
        mercon_total: merconTotal,
        physical_gps_total: physicalGpsTotal,
        not_connected_total: notConnectedTotal,
        reconciliation_valid: reconciliationValid,
        category_sum: categorySum,
        status_counts: statusCounts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to compute physical GPS status summary' } });
  }
};

export const getVehicleUsage = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const [activeTrips, totalTrips, maintenanceRecords, expenses] = await Promise.all([
      prisma.trip.count({ where: { vehicleId: id, status: { in: ACTIVE_TRIP_STATUSES as any } } }),
      prisma.trip.count({ where: { vehicleId: id } }),
      prisma.maintenanceRecord.count({ where: { vehicleId: id } }),
      prisma.expense.count({ where: { vehicleId: id } })
    ]);
    res.json({ success: true, data: { activeTrips, totalTrips, maintenanceRecords, expenses } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load vehicle usage' } });
  }
};

export const bulkDeleteVehicles = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No IDs provided' } });
    }

    const inUse = await prisma.trip.findMany({
      where: { vehicleId: { in: ids }, status: { in: ACTIVE_TRIP_STATUSES as any } },
      select: { vehicleId: true },
      distinct: ['vehicleId']
    });
    const inUseIds = new Set(inUse.map((t) => t.vehicleId));
    const deletableIds = ids.filter((id: string) => !inUseIds.has(id));

    if (deletableIds.length > 0) {
      await prisma.$transaction([
        prisma.trip.updateMany({ where: { vehicleId: { in: deletableIds } }, data: { vehicleId: null } }),
        prisma.expense.updateMany({ where: { vehicleId: { in: deletableIds } }, data: { vehicleId: null } }),
        prisma.maintenanceRecord.deleteMany({ where: { vehicleId: { in: deletableIds } } }),
        prisma.driverVehicleAssignment.deleteMany({ where: { vehicleId: { in: deletableIds } } }),
        prisma.driver.updateMany({ where: { assignedVehicleId: { in: deletableIds } }, data: { assignedVehicleId: null } }),
        prisma.vehicle.deleteMany({ where: { id: { in: deletableIds } } })
      ]);
    }

    const skippedMessage = inUseIds.size > 0 ? ` ${inUseIds.size} skipped (active trip in progress).` : '';
    res.json({ success: true, data: { message: `Successfully deleted ${deletableIds.length} vehicles.${skippedMessage}` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to bulk delete vehicles` } });
  }
};

export const bulkUpdateVehicleStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'IDs and status are required' } });
    }

    await prisma.vehicle.updateMany({
      where: { id: { in: ids } },
      data: {
        status: status as AssetStatus,
        updated_by: userId
      }
    });
    res.json({ success: true, data: { message: `Successfully updated ${ids.length} vehicles` } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to bulk update vehicles` } });
  }
};

// tripIncome/isEarned moved to reportEngine/derived.ts so the report builder
// query engine uses the exact same definitions — see that file for docs.

/** `YYYY-MM` bucket key used by the monthly trend series. */
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * Parses `from`/`to` query params into a Prisma date filter. Both are optional;
 * an absent range means "all time".
 */
const parseDateRange = (req: Request) => {
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const valid = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d : null);
  return { from: valid(from), to: valid(to) };
};

/** Builds the month-by-month income/expense/profit series from raw rows. */
const buildMonthlySeries = (
  incomeRows: { date: Date; amount: number }[],
  expenseRows: { date: Date; amount: number }[]
) => {
  const buckets = new Map<string, { month: string; income: number; expenses: number; profit: number }>();
  const bucket = (d: Date) => {
    const key = monthKey(d);
    if (!buckets.has(key)) buckets.set(key, { month: key, income: 0, expenses: 0, profit: 0 });
    return buckets.get(key)!;
  };

  for (const row of incomeRows) bucket(row.date).income += row.amount;
  for (const row of expenseRows) bucket(row.date).expenses += row.amount;

  return [...buckets.values()]
    .map((b) => ({ ...b, profit: b.income - b.expenses }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

export const getVehicleFinancials = async (req: Request, res: Response) => {
  try {
    const enabledModules = await getEnabledModules();
    const invoicesOn = enabledModules.has('invoices');
    const maintenanceOn = enabledModules.has('maintenance');

    const vehicleId = req.params.id as string;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId, deletedAt: null },
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });
    }

    const { from, to } = parseDateRange(req);
    const rangeFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

    // tripIncome() already prefers billing_amount (core) over invoice.total_amount,
    // falling back to it only when billing_amount is unset — so simply omitting
    // the invoices include when the module is off degrades gracefully rather
    // than needing separate income logic.
    const trips = await prisma.trip.findMany({
      where: { vehicleId, deletedAt: null, ...(rangeFilter ? { createdAt: rangeFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
      },
    });

    const maintenanceRecords = maintenanceOn
      ? await prisma.maintenanceRecord.findMany({
          where: { vehicleId, deletedAt: null, ...(rangeFilter ? { start_date: rangeFilter } : {}) },
          orderBy: [{ start_date: 'desc' }, { service_date: 'desc' }],
        })
      : [];

    let totalIncome = 0;
    let driverCharges = 0;
    let totalDistanceKm = 0;
    const tripBreakdown = trips.map((t) => {
      const income = tripIncome(t);
      const tripCharges = Number((t as any).driver_payout ?? (t as any).driver_charge ?? (t as any).trip_charges ?? 0);
      if (isEarned(t.status)) {
        totalIncome += income;
        driverCharges += tripCharges;
        totalDistanceKm += t.planned_distance || 0;
      }
      return {
        id: t.id,
        ref_id: t.ref_id,
        status: t.status,
        customer_name: t.customer?.name || 'N/A',
        date: t.actual_end || t.actual_start || t.createdAt,
        income,
        trip_charges: tripCharges,
      };
    });

    // MaintenanceRecord.cost is Decimal at runtime — Number() before `+`,
    // which otherwise silently string-concatenates instead of summing.
    const maintenanceRecordsCost = maintenanceRecords.reduce((sum, m) => sum + Number(m.cost), 0);
    const renewalExpenses = maintenanceRecords
      .filter((m) => m.maintenance_type === 'Renewal')
      .reduce((sum, m) => sum + Number(m.cost), 0);

    const expenses = await prisma.expense.findMany({
      where: { vehicleId, deletedAt: null, ...(rangeFilter ? { expense_date: rangeFilter } : {}) },
      orderBy: { expense_date: 'desc' }
    });

    let fuelExpenses = 0;
    let salaryExpenses = 0;
    let categoryMaintenanceExpenses = 0;
    let otherExpenses = 0;

    const operatingExpensesList = expenses
      .filter((e) => !(e.ref_id && e.ref_id.startsWith('EXP-MNT-')))
      .map((e) => {
        // Expense.amount is Decimal at runtime — same conversion, same reason.
        const amount = Number(e.amount);
        const cat = (e.category || '').toLowerCase().trim();
        if (cat === 'fuel') {
          fuelExpenses += amount;
        } else if (cat === 'salary' || cat === 'salary advance') {
          salaryExpenses += amount;
        } else if (cat === 'vehicle maintenance' || cat === 'maintenance') {
          categoryMaintenanceExpenses += amount;
        } else {
          otherExpenses += amount;
        }
        return {
          id: e.id,
          ref_id: e.ref_id,
          category: e.category || 'Other',
          amount,
          date: e.expense_date || e.createdAt,
          description: e.description,
        };
      });

    const totalMaintenanceExpenses = maintenanceRecordsCost + categoryMaintenanceExpenses;
    const totalExpenses = driverCharges + totalMaintenanceExpenses + fuelExpenses + salaryExpenses + otherExpenses;
    const netProfit = totalIncome - totalExpenses;
    const marginPercent = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : 0;

    const monthly = buildMonthlySeries(
      trips
        .filter((t) => isEarned(t.status))
        .map((t) => ({ date: t.actual_end || t.actual_start || t.createdAt, amount: tripIncome(t) })),
      [
        ...maintenanceRecords.map((m) => ({ date: m.start_date || m.service_date, amount: Number(m.cost) })),
        ...expenses
          .filter((e) => !(e.ref_id && e.ref_id.startsWith('EXP-MNT-')))
          .map((e) => ({ date: e.expense_date || e.createdAt, amount: Number(e.amount) }))
      ]
    );

    res.json({
      success: true,
      data: {
        vehicle_id: vehicle.id,
        plate_number: vehicle.plate_number,
        ref_id: vehicle.ref_id,
        asset_type: vehicle.asset_type,
        summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses,
          driver_charges: driverCharges,
          fuel_expenses: fuelExpenses,
          maintenance_expenses: totalMaintenanceExpenses,
          renewal_expenses: renewalExpenses,
          salary_expenses: salaryExpenses,
          other_expenses: otherExpenses,
          net_profit: netProfit,
          margin_percent: marginPercent,
          completed_trips_count: trips.filter((t) => isEarned(t.status)).length,
          total_maintenance_count: maintenanceRecords.length,
          total_distance_km: totalDistanceKm,
        },
        monthly,
        income_sources: tripBreakdown,
        expense_records: maintenanceRecords,
        operating_expenses: operatingExpensesList,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch vehicle financial report' } });
  }
};

/**
 * Fleet-wide P&L: one row per vehicle so the dashboard can rank the fleet by
 * profit/loss without firing a request per truck. Accepts the same optional
 * `from`/`to` range as the per-vehicle report.
 */
export const getFleetFinancials = async (req: Request, res: Response) => {
  try {
    const enabledModules = await getEnabledModules();
    const invoicesOn = enabledModules.has('invoices');
    const maintenanceOn = enabledModules.has('maintenance');

    const { from, to } = parseDateRange(req);
    const rangeFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

    const [vehicles, trips, maintenanceRecords] = await Promise.all([
      prisma.vehicle.findMany({
        where: { deletedAt: null },
        orderBy: { plate_number: 'asc' },
      }),
      prisma.trip.findMany({
        where: { deletedAt: null, vehicleId: { not: null }, ...(rangeFilter ? { createdAt: rangeFilter } : {}) },
      }),
      maintenanceOn
        ? prisma.maintenanceRecord.findMany({
            where: { deletedAt: null, ...(rangeFilter ? { start_date: rangeFilter } : {}) },
          })
        : Promise.resolve([]),
    ]);

    type Bucket = {
      income: number;
      expenses: number;
      maintenance_expenses: number;
      renewal_expenses: number;
      trips_count: number;
      maintenance_count: number;
      driver_charges: number;
      fuel_expenses: number;
      salary_expenses: number;
      other_expenses: number;
    };
    const byVehicle = new Map<string, Bucket>();
    const bucket = (id: string) => {
      if (!byVehicle.has(id)) {
        byVehicle.set(id, {
          income: 0, expenses: 0, maintenance_expenses: 0,
          renewal_expenses: 0, trips_count: 0, maintenance_count: 0,
          driver_charges: 0, fuel_expenses: 0, salary_expenses: 0,
          other_expenses: 0,
        });
      }
      return byVehicle.get(id)!;
    };

    for (const t of trips) {
      if (!t.vehicleId || !isEarned(t.status)) continue;
      const b = bucket(t.vehicleId);
      b.income += tripIncome(t);
      b.trips_count += 1;
      b.driver_charges += Number((t as any).driver_charge ?? (t as any).trip_charges ?? 0);
    }

    // MaintenanceRecord.cost / Expense.amount are Decimal at runtime —
    // Number() before every `+=` below, which otherwise silently
    // string-concatenates instead of summing.
    for (const m of maintenanceRecords) {
      const b = bucket(m.vehicleId);
      const cost = Number(m.cost);
      b.expenses += cost;
      b.maintenance_count += 1;
      if (m.maintenance_type === 'Renewal') b.renewal_expenses += cost;
      else b.maintenance_expenses += cost;
    }

    const expenses = await prisma.expense.findMany({
      where: { deletedAt: null, vehicleId: { not: null }, ...(rangeFilter ? { expense_date: rangeFilter } : {}) }
    });

    for (const e of expenses) {
      if (!e.vehicleId) continue;
      if (e.ref_id && e.ref_id.startsWith('EXP-MNT-')) continue;
      const b = bucket(e.vehicleId);
      const amount = Number(e.amount);
      b.expenses += amount;

      const cat = (e.category || '').toLowerCase().trim();
      if (cat === 'fuel') {
        b.fuel_expenses += amount;
      } else if (cat === 'salary' || cat === 'salary advance') {
        b.salary_expenses += amount;
      } else if (cat === 'vehicle maintenance' || cat === 'maintenance') {
        b.maintenance_expenses += amount;
      } else {
        b.other_expenses += amount;
      }
    }

    const rows = vehicles.map((v) => {
      const b = byVehicle.get(v.id) ?? {
        income: 0, expenses: 0, maintenance_expenses: 0,
        renewal_expenses: 0, trips_count: 0, maintenance_count: 0,
        driver_charges: 0, fuel_expenses: 0, salary_expenses: 0,
        other_expenses: 0,
      };
      const net = b.income - b.expenses - b.driver_charges;
      return {
        vehicle_id: v.id,
        plate_number: v.plate_number,
        ref_id: v.ref_id,
        asset_type: v.asset_type,
        status: v.status,
        capacity_kg: v.capacity_kg,
        total_income: b.income,
        total_expenses: b.expenses,
        maintenance_expenses: b.maintenance_expenses,
        renewal_expenses: b.renewal_expenses,
        driver_charges: b.driver_charges,
        fuel_expenses: b.fuel_expenses,
        salary_expenses: b.salary_expenses,
        other_expenses: b.other_expenses,
        net_profit: net,
        margin_percent: b.income > 0 ? Math.round((net / b.income) * 1000) / 10 : 0,
        trips_count: b.trips_count,
        maintenance_count: b.maintenance_count,
        income_per_trip: b.trips_count > 0 ? Math.round(b.income / b.trips_count) : 0,
      };
    });

    const totalIncome = rows.reduce((s, r) => s + r.total_income, 0);
    const totalExpenses = rows.reduce((s, r) => s + r.total_expenses, 0);
    const totalDriverCharges = rows.reduce((s, r) => s + r.driver_charges, 0);
    const netProfit = totalIncome - totalExpenses - totalDriverCharges;

    // cost/amount/trip_charges are Decimal at runtime, and a Decimal instance
    // is always truthy even when it holds 0 — `&& t.trip_charges` below is
    // filtering "has a trip_charges value at all", which needs the Number()
    // conversion to still exclude a genuine zero the way it did as a Float.
    const monthlyExpenses = [
      ...maintenanceRecords.map((m) => ({ date: m.start_date || m.service_date, amount: Number(m.cost) })),
      ...expenses.filter(e => !(e.ref_id && e.ref_id.startsWith('EXP-MNT-'))).map((e) => ({ date: e.expense_date, amount: Number(e.amount) })),
      ...trips.filter(t => t.vehicleId && isEarned(t.status) && Number((t as any).driver_payout ?? (t as any).driver_charge ?? (t as any).trip_charges ?? 0)).map((t) => ({ date: t.actual_end || t.actual_start || t.createdAt, amount: Number((t as any).driver_payout ?? (t as any).driver_charge ?? (t as any).trip_charges ?? 0) })),
    ];

    const monthly = buildMonthlySeries(
      trips
        .filter((t) => t.vehicleId && isEarned(t.status))
        .map((t) => ({ date: t.actual_end || t.actual_start || t.createdAt, amount: tripIncome(t) })),
      monthlyExpenses
    );

    res.json({
      success: true,
      data: {
        range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
        fleet_summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses + totalDriverCharges,
          maintenance_expenses: rows.reduce((s, r) => s + r.maintenance_expenses, 0),
          renewal_expenses: rows.reduce((s, r) => s + r.renewal_expenses, 0),
          net_profit: netProfit,
          margin_percent: totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : 0,
          vehicles_count: rows.length,
          profitable_count: rows.filter((r) => r.net_profit > 0).length,
          loss_making_count: rows.filter((r) => r.net_profit < 0).length,
          idle_count: rows.filter((r) => r.total_income === 0 && r.total_expenses === 0 && r.driver_charges === 0).length,
          total_trips: rows.reduce((s, r) => s + r.trips_count, 0),
          total_maintenance: rows.reduce((s, r) => s + r.maintenance_count, 0),
        },
        vehicles: rows,
        monthly,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch fleet financial report' } });
  }
};

export const getIccesStatus = async (_req: Request, res: Response) => {
  try {
    const { getIccesStatusSummary } = await import('../services/icces/fleetPoller');
    const summary = getIccesStatusSummary();

    const [totalVehicles, linkedVehicles, activeReporting] = await Promise.all([
      prisma.vehicle.count({ where: { deletedAt: null } }),
      prisma.vehicle.count({ where: { deletedAt: null, icces_device_id: { not: null } } }),
      prisma.vehicle.count({
        where: {
          deletedAt: null,
          icces_device_id: { not: null },
          last_seen_at: { gte: new Date(Date.now() - 3600_000) },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        ...summary,
        totalVehicles,
        linkedVehicles,
        unlinkedVehicles: totalVehicles - linkedVehicles,
        activeReporting,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch ICCES telemetry status' } });
  }
};


