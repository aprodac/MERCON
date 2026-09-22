import express, { Request, Response } from 'express';
import path from 'path';
import { logger } from './utils/logger';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { requestContext } from './middlewares/requestContext';

// A rejection/exception that reaches here would otherwise be either a
// silent no-op (unhandledRejection) or an ungraceful, unlogged crash
// (uncaughtException). Both are now logged with the full error before any
// process-exit decision is made.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);
// CORS origin is left open here (tightened for the HTTP API in Phase 3) —
// authentication below is what actually gates access to this socket server.
export const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH'] }
});

const port = env.PORT;
import { prisma } from './db';
export { prisma };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SocketUser {
  id?: string;
  driver_id?: string;
  role?: 'Admin' | 'Operator' | 'Driver';
}

import authRoutes from './routes/authRoutes';
import driverRoutes from './routes/driverRoutes';
import vehicleRoutes from './routes/vehicleRoutes';
import customerRoutes from './routes/customerRoutes';
import tripRoutes from './routes/tripRoutes';
import maintenanceRoutes from './routes/maintenanceRoutes';
import expenseRoutes from './routes/expenseRoutes';
import documentRoutes from './routes/documentRoutes';
import folderRoutes from './routes/folderRoutes';
import documentTypeRoutes from './routes/documentTypeRoutes';
import reportsRoutes from './routes/reportsRoutes';
import reportTemplateRoutes from './routes/reportTemplateRoutes';
import reportBuilderRoutes from './routes/reportBuilderRoutes';
import mobileAuthRoutes from './routes/mobileAuthRoutes';
import mobileTripRoutes from './routes/mobileTripRoutes';
import mobileNotificationRoutes from './routes/mobileNotificationRoutes';
import mobileDeviceRoutes from './routes/mobileDeviceRoutes';
import mobileProfileRoutes from './routes/mobileProfileRoutes';
import mobileEmergencyRoutes from './routes/mobileEmergencyRoutes';
import mobileMiscRoutes from './routes/mobileMiscRoutes';
import quotationRoutes from './routes/quotationRoutes';
import rateCardRoutes from './routes/rateCardRoutes';
import surchargeRuleRoutes from './routes/surchargeRuleRoutes';
import locationRoutes from './routes/locationRoutes';
import notificationRoutes from './routes/notificationRoutes';
import uploadRoutes from './routes/uploadRoutes';
import userRoutes from './routes/userRoutes';
import trashRoutes from './routes/trashRoutes';
import settingsRoutes from './routes/settingsRoutes';
import thirdPartyRoutes from './routes/thirdPartyRoutes';
import geocodingRoutes from './routes/geocodingRoutes';
import vehicleCompatibilityRoutes from './routes/vehicleCompatibilityRoutes';
import publicRoutes from './routes/publicRoutes';
import errorEventRoutes from './routes/errorEventRoutes';
import accountRoutes from './routes/accountRoutes';
import accountingPeriodRoutes from './routes/accountingPeriodRoutes';
import journalEntryRoutes from './routes/journalEntryRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import billRoutes from './routes/billRoutes';
import { reportClientError } from './controllers/clientErrorController';
import { validate } from './middlewares/validate';
import { clientErrorBody } from './schemas';
import { authenticateJWT } from './middlewares/auth';
import { initFleetTracking } from './services/icces/fleetPoller';
import { normalizeMobileLocationUpdate } from './services/tracking/locationUpdate';
import { initTripDelayMonitor } from './services/tracking/tripDelayMonitor';

import helmet from 'helmet';
// @ts-ignore
import compression from 'compression';

// Middleware
app.use(requestContext);
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'X-CSRF-Token'],
}));

// Gzip every response big enough to be worth it. List endpoints return highly
// repetitive JSON (rosters, trip manifests) that compresses ~10x — without this
// the wire transfer dominates the response time on the hosted deployment, since
// the VPS nginx only gzips text/html by default, not application/json.
app.use(compression());

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
}));
app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));

// Default 100kb is too small for bulk-import bodies — a few hundred imported
// rate card / customer / driver / vehicle rows posted as JSON easily exceeds
// it and fails with "request entity too large" before the row-by-row import
// logic ever runs.
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));
import { getUploadDir } from './middlewares/upload';
app.use('/uploads', express.static(getUploadDir()));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.use('/uploads', express.static('/tmp/uploads'));

// Create API router and mount all API routes
const apiRouter = express.Router();
apiRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
apiRouter.use('/auth', authRoutes);
apiRouter.use('/drivers', driverRoutes);
apiRouter.use('/vehicles', vehicleRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/trips', tripRoutes);
apiRouter.use('/maintenance', maintenanceRoutes);
apiRouter.use('/expenses', expenseRoutes);
apiRouter.use('/reports', reportsRoutes);
apiRouter.use('/report-templates', reportTemplateRoutes);
apiRouter.use('/report-builder', reportBuilderRoutes);
apiRouter.use('/documents', documentRoutes);
apiRouter.use('/folders', folderRoutes);
apiRouter.use('/document-types', documentTypeRoutes);
apiRouter.use('/quotations', quotationRoutes);
// Legacy compatibility route
apiRouter.use('/rate-cards', rateCardRoutes);
apiRouter.use('/surcharge-rules', surchargeRuleRoutes);
apiRouter.use('/locations', locationRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/upload', uploadRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/trash', trashRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/third-party-providers', thirdPartyRoutes);
apiRouter.use('/geocoding', geocodingRoutes);
apiRouter.use('/vehicle-compatibility', vehicleCompatibilityRoutes);
apiRouter.use('/public', publicRoutes);
apiRouter.use('/error-events', errorEventRoutes);
apiRouter.use('/accounts', accountRoutes);
apiRouter.use('/accounting-periods', accountingPeriodRoutes);
apiRouter.use('/journal-entries', journalEntryRoutes);
apiRouter.use('/invoices', invoiceRoutes);
apiRouter.use('/bills', billRoutes);
apiRouter.post('/client-errors', authenticateJWT, validate({ body: clientErrorBody }), reportClientError);

// Mount router on both /api and root for maximum proxy compatibility
app.use('/api', apiRouter);
app.use(apiRouter);

// Mobile API Routes
app.use('/mobile/auth', mobileAuthRoutes);
app.use('/mobile/trips', mobileTripRoutes);
app.use('/mobile/notifications', mobileNotificationRoutes);
app.use('/mobile/devices', mobileDeviceRoutes);
app.use('/api/mobile/devices', mobileDeviceRoutes);
app.use('/mobile/profile', mobileProfileRoutes);
app.use('/mobile/emergency', mobileEmergencyRoutes);
app.use('/mobile', mobileMiscRoutes); // /mobile/documents, /mobile/vehicle
app.use('/api/mobile', mobileMiscRoutes);

// Socket.io Telemetry WebSockets — every connection must present a valid JWT
// (same token used for the HTTP API) in the handshake, or it's rejected.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  jwt.verify(token, env.JWT_SECRET, (err: jwt.VerifyErrors | null, decoded: any) => {
    if (err || !decoded) return next(new Error('Invalid or expired token'));
    (socket.data as { user: SocketUser }).user = decoded as SocketUser;
    next();
  });
});

io.on('connection', (socket: Socket) => {
  const user = (socket.data as { user: SocketUser }).user;
  logger.info(`📡 WebSocket connected: ${socket.id} (${user.role ?? 'unknown'})`);

  // Auto-join a private room for this identity so server-sent notifications
  // (createNotification/createDriverNotification) can target them directly
  // instead of broadcasting to every connected client.
  if (user.role === 'Driver' && user.driver_id) {
    socket.join(`driver:${user.driver_id}`);
  } else if (user.id) {
    socket.join(`user:${user.id}`);
  }

  // A dashboard (Admin/Operator) or the assigned driver asks to watch a
  // specific trip's live location. Only the assigned driver or an
  // Admin/Operator may join — never an arbitrary authenticated client.
  socket.on('join:trip', async (tripId: unknown) => {
    try {
      if (typeof tripId !== 'string' || !UUID_RE.test(tripId)) return;

      if (user.role === 'Admin' || user.role === 'Operator') {
        socket.join(`trip:${tripId}`);
        return;
      }
      if (user.role === 'Driver' && user.driver_id) {
        const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { driverId: true } });
        if (trip?.driverId === user.driver_id) socket.join(`trip:${tripId}`);
      }
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'join:trip failed');
    }
  });

  // Driver sends a GPS update. Only accepted from the driver actually
  // assigned to that trip, and relayed only to that trip's room — not to
  // every connected client.
  socket.on('driver:location_update', async (data) => {
    try {
      if (user.role !== 'Driver' || !user.driver_id) return;
      if (!data || typeof data.tripId !== 'string' || data.driverId !== user.driver_id) return;

      // Authorisation says who may speak; it says nothing about what they said.
      // This payload used to be relayed verbatim, so a malformed or hostile
      // client could put a non-numeric position on every watching operator's map.
      const update = normalizeMobileLocationUpdate(data);
      if (!update) return;

      const trip = await prisma.trip.findUnique({ where: { id: data.tripId }, select: { driverId: true } });
      if (trip?.driverId !== user.driver_id) return;

      io.to(`trip:${data.tripId}`).emit(`trip:location_update:${data.tripId}`, update);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'driver:location_update failed');
    }
  });

  socket.on('disconnect', () => {
    logger.info(`📡 WebSocket disconnected: ${socket.id}`);
  });
});

// Healthcheck endpoint
app.get(['/health', '/api/health'], async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, message: 'MERCON API is running perfectly!', db: 'connected' });
  } catch (err: any) {
    logger.error({ err }, 'Healthcheck database probe failed');
    res.status(503).json({ success: false, db: 'unavailable' });
  }
});


// Catches errors passed via next(err) — most notably multer's fileFilter
// rejections (invalid upload type). Must be registered after all routes.
// Without this, Express's default handler returns a raw HTML page with a
// full stack trace and a misleading 500 for what's really a 400-level
// client error.
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  logger.error({ err }, 'Unhandled request error');
  res.status(400).json({
    success: false,
    error: { code: 'BAD_REQUEST', message: err.message || 'Invalid request', requestId: (req as Request & { id?: string }).id },
  });
});

// Initialize Background Workers
initFleetTracking();
initTripDelayMonitor();

async function startServer() {
  httpServer.listen(port, '0.0.0.0', () => {
    logger.info(`🚀 MERCON API Server (with WebSockets) is running on port ${port}`);
  });
}

startServer();
