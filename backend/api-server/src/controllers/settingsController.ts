import { Request, Response } from 'express';
import { prisma } from '../db';
import { MODULE_KEYS, COMMON_TIMEZONES } from '@mercon/shared-types';

const SINGLETON_ID = 'singleton';

const DEFAULT_SETTINGS = {
  id: SINGLETON_ID,
  appName: 'MERCON Operator Platform',
  companyLegalName: 'MERCON Operations Ltd.',
  vatNumber: '312709215800003',
  crNumber: '1009152862',
  logoUrl: null,
  primaryColor: '#E8450F',
  timezone: 'Asia/Riyadh',
  defaultCountryCode: 'SA',
  defaultCountryDialCode: '+966',
  enabledModules: [...MODULE_KEYS],
  hiddenModules: [],
  defaultRedirectModule: 'quotations',
  themeColors: null,
  taxonomyConfig: null,
  maintenanceMode: false,
  maintenanceBanner: null,
  updated_by: null,
  updatedAt: new Date(),
};

/** Used by trip creation to stamp carrier_name from this deployment's own name, not a hardcoded literal. */
export async function getCompanyLegalName(): Promise<string> {
  try {
    const settings = await getOrCreateSettings();
    return settings?.companyLegalName || 'MERCON Operations Ltd.';
  } catch {
    return 'MERCON Operations Ltd.';
  }
}

/**
 * Single source of truth for "is module X on for this deployment" — used by
 * requireModuleEnabled and by controllers that need to filter cross-module
 * data (reports, trash, vehicle financials) rather than 403 outright.
 */
export async function getEnabledModules(): Promise<Set<string>> {
  try {
    const settings = await getOrCreateSettings();
    return new Set(settings?.enabledModules || MODULE_KEYS);
  } catch {
    return new Set(MODULE_KEYS);
  }
}

// enabledModules defaults to every known module on first creation — this is
// the row's *only* creation path (also used by seed.ts's own upsert with the
// same default), so a deployment can never end up with an empty list simply
// because a request created the row before the seed ran. requireModuleEnabled
// fails closed on an empty list, so getting this default wrong 403s every
// gated module at once.
async function getOrCreateSettings() {
  try {
    return await prisma.settings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { 
        id: SINGLETON_ID, 
        enabledModules: [...MODULE_KEYS], 
        hiddenModules: [], 
        defaultRedirectModule: 'quotations',
        vatNumber: '312709215800003',
        crNumber: '1009152862'
      },
    });
  } catch (err: any) {
    console.warn('[Settings] Unable to query Settings from database, using defaults:', err.message || err);
    return DEFAULT_SETTINGS as any;
  }
}

/* ─── Public branding — unauthenticated, so the login page can brand itself ── */
export const getPublicSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    return res.json({
      success: true,
      data: {
        appName: settings.appName,
        companyLegalName: settings.companyLegalName,
        vatNumber: settings.vatNumber,
        crNumber: settings.crNumber,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        themeColors: settings.themeColors,
        timezone: settings.timezone,
        defaultCountryCode: settings.defaultCountryCode,
        defaultCountryDialCode: settings.defaultCountryDialCode,
        maintenanceMode: settings.maintenanceMode,
        maintenanceBanner: settings.maintenanceBanner,
      },
    });
  } catch (error) {
    return res.json({
      success: true,
      data: {
        appName: DEFAULT_SETTINGS.appName,
        companyLegalName: DEFAULT_SETTINGS.companyLegalName,
        vatNumber: DEFAULT_SETTINGS.vatNumber,
        crNumber: DEFAULT_SETTINGS.crNumber,
        logoUrl: DEFAULT_SETTINGS.logoUrl,
        primaryColor: DEFAULT_SETTINGS.primaryColor,
        themeColors: null,
        timezone: DEFAULT_SETTINGS.timezone,
        defaultCountryCode: DEFAULT_SETTINGS.defaultCountryCode,
        defaultCountryDialCode: DEFAULT_SETTINGS.defaultCountryDialCode,
        maintenanceMode: false,
        maintenanceBanner: null,
      },
    });
  }
};

/* ─── Full settings — authenticated ─────────────────────────────────────────── */
export const getSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load settings' } });
  }
};

/* ─── Update just the timezone — any Admin ──────────────────────────────────── */
export const updateTimezone = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { timezone } = req.body;

    if (typeof timezone !== 'string' || !(COMMON_TIMEZONES as readonly string[]).includes(timezone)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'timezone must be one of the supported IANA timezones' },
      });
    }

    await getOrCreateSettings();
    const settings = await prisma.settings.update({
      where: { id: SINGLETON_ID },
      data: { timezone, updated_by: userId },
    });

    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update timezone' } });
  }
};

/* ─── Update settings — requireSuperAdmin gated ─────────────────────────────── */
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      appName,
      companyLegalName,
      vatNumber,
      crNumber,
      logoUrl,
      primaryColor,
      themeColors,
      taxonomyConfig,
      maintenanceMode,
      maintenanceBanner,
      timezone,
      defaultCountryCode,
      defaultCountryDialCode,
      enabledModules,
      hiddenModules,
      defaultRedirectModule,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (appName !== undefined) data.appName = String(appName).trim();
    if (companyLegalName !== undefined) data.companyLegalName = String(companyLegalName).trim();
    if (vatNumber !== undefined) data.vatNumber = vatNumber ? String(vatNumber).trim() : null;
    if (crNumber !== undefined) data.crNumber = crNumber ? String(crNumber).trim() : null;
    if (logoUrl !== undefined) data.logoUrl = logoUrl ? String(logoUrl).trim() : null;
    if (primaryColor !== undefined) data.primaryColor = String(primaryColor).trim();
    if (themeColors !== undefined) data.themeColors = themeColors;
    if (taxonomyConfig !== undefined) data.taxonomyConfig = taxonomyConfig;
    if (maintenanceMode !== undefined) data.maintenanceMode = Boolean(maintenanceMode);
    if (maintenanceBanner !== undefined) data.maintenanceBanner = maintenanceBanner ? String(maintenanceBanner).trim() : null;
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || !timezone.trim()) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'timezone must be a non-empty string' } });
      }
      data.timezone = timezone.trim();
    }
    if (defaultCountryCode !== undefined) data.defaultCountryCode = String(defaultCountryCode).trim();
    if (defaultCountryDialCode !== undefined) data.defaultCountryDialCode = String(defaultCountryDialCode).trim();
    if (defaultRedirectModule !== undefined) data.defaultRedirectModule = String(defaultRedirectModule).trim();
    if (enabledModules !== undefined) {
      if (!Array.isArray(enabledModules) || !enabledModules.every((m) => typeof m === 'string')) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'enabledModules must be an array of strings' } });
      }
      data.enabledModules = enabledModules;
    }
    if (hiddenModules !== undefined) {
      if (!Array.isArray(hiddenModules) || !hiddenModules.every((m) => typeof m === 'string')) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'hiddenModules must be an array of strings' } });
      }
      data.hiddenModules = hiddenModules;
    }
    data.updated_by = userId;

    await getOrCreateSettings();
    const settings = await prisma.settings.update({ where: { id: SINGLETON_ID }, data });

    return res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('[Settings] Failed to update settings:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error?.message || 'Failed to update settings' } });
  }
};

/* ─── SuperAdmin Health Diagnostics Endpoint ───────────────────────────────── */
export const getSystemHealth = async (_req: Request, res: Response) => {
  try {
    const dbStartTime = Date.now();
    const userCount = await prisma.user.count({ where: { isActive: true } });
    const dbLatencyMs = Date.now() - dbStartTime;

    const tripCount = await prisma.trip.count();
    const driverCount = await prisma.driver.count({ where: { isActive: true } });
    const vehicleCount = await prisma.vehicle.count({ where: { isActive: true } });

    return res.json({
      success: true,
      data: {
        status: 'HEALTHY',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          latencyMs: dbLatencyMs,
        },
        telemetry: {
          activeUsers: userCount,
          activeDrivers: driverCount,
          activeVehicles: vehicleCount,
          totalTrips: tripCount,
          serverUptimeSeconds: process.uptime(),
          nodeVersion: process.version,
          memoryUsage: process.memoryUsage(),
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'HEALTH_CHECK_FAILED', message: error.message || 'System health verification failed' },
    });
  }
};

/* ─── SuperAdmin Audit Logs Endpoint ────────────────────────────────────────── */
/**
 * Real audit trail, backed by the AuditLog table that auditService.logAuditEvent
 * writes to (user management actions, Finance journal/invoice/bill state changes,
 * etc.) — not a reconstructed feed. Supports filtering and pagination for the
 * dedicated Audit Log page; called with no query params for the small
 * System Health widget's recent-activity stream.
 */
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { action, entityType, userId, date_from, date_to, search, page = '1', per_page = '50' } = req.query;

    const pageNumber = Math.max(1, parseInt(page as string) || 1);
    const limit = Math.max(1, parseInt(per_page as string) || 50);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = {};

    if (action && action !== 'all') {
      whereClause.action = action as string;
    }

    if (entityType && entityType !== 'all') {
      whereClause.entityType = entityType as string;
    }

    if (userId && userId !== 'all') {
      whereClause.userId = userId as string;
    }

    if (date_from || date_to) {
      whereClause.createdAt = {};
      if (date_from) whereClause.createdAt.gte = new Date(date_from as string);
      if (date_to) whereClause.createdAt.lte = new Date(date_to as string);
    }

    if (search) {
      const q = String(search).trim();
      whereClause.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { entityType: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [logs, total, distinctActions, distinctEntityTypes] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, username: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: whereClause }),
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    ]);

    return res.json({
      success: true,
      data: logs,
      pagination: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      filters: {
        actions: distinctActions.map((a) => a.action),
        entityTypes: distinctEntityTypes.map((e) => e.entityType),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch audit logs' } });
  }
};
