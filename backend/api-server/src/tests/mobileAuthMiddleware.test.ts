import test from 'node:test';
import assert from 'node:assert/strict';
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth';
import { env } from '../config/env';
import { prisma } from '../db';

function createMockRes() {
  let statusCode = 200;
  let jsonBody: any = null;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (data: any) => {
          jsonBody = data;
        },
      };
    },
    json: (data: any) => {
      jsonBody = data;
    },
  } as unknown as Response;

  return { res, getResult: () => ({ status: statusCode, body: jsonBody }) };
}

test('Mobile Auth Middleware - Driver Identity & Fallback Suite', async (t) => {
  const origUserFindUnique = prisma.user.findUnique;
  const origDriverFindFirst = prisma.driver.findFirst;

  t.after(() => {
    prisma.user.findUnique = origUserFindUnique;
    prisma.driver.findFirst = origDriverFindFirst;
  });

  await t.test('Case A: Normal Driver with linked User preserves driver_id in req.user', async () => {
    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'user-uuid-1') {
        return {
          id: 'user-uuid-1',
          role: 'Driver',
          isActive: true,
          isSuperAdmin: false,
          name: 'Driver One',
          email: null,
          username: '+966500000001',
        };
      }
      return null;
    }) as any;
    prisma.driver.findFirst = (async () => null) as any;

    const token = jwt.sign(
      { id: 'user-uuid-1', driver_id: 'driver-uuid-1', role: 'Driver' },
      env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    const { res } = createMockRes();

    await authenticateJWT(req, res, next);

    assert.equal(nextCalled, true);
    assert.ok(req.user);
    assert.equal(req.user.id, 'user-uuid-1');
    assert.equal(req.user.role, 'Driver');
    assert.equal(req.user.driver_id, 'driver-uuid-1');
  });

  await t.test('Case B: Driver API request identity check allows Driver mobile controllers to access req.user.driver_id', async () => {
    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'user-uuid-1') {
        return {
          id: 'user-uuid-1',
          role: 'Driver',
          isActive: true,
          isSuperAdmin: false,
          name: 'Driver One',
          email: null,
          username: '+966500000001',
        };
      }
      return null;
    }) as any;
    prisma.driver.findFirst = (async () => null) as any;

    const token = jwt.sign(
      { id: 'user-uuid-1', driver_id: 'driver-uuid-1', role: 'Driver' },
      env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    const { res } = createMockRes();

    await authenticateJWT(req, res, next);

    assert.equal(nextCalled, true);
    assert.ok(req.user);

    const mockMobileControllerHandler = (request: AuthenticatedRequest, response: Response) => {
      const driverId = request.user?.driver_id;
      if (!driverId) {
        return response.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
      }
      return response.json({ success: true, data: { driverId } });
    };

    const { res: controllerRes, getResult: getControllerResult } = createMockRes();
    mockMobileControllerHandler(req, controllerRes);

    const result = getControllerResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.driverId, 'driver-uuid-1');
  });

  await t.test('Case C: Standalone Driver without User record falls back to active Driver lookup', async () => {
    prisma.user.findUnique = (async () => null) as any;
    prisma.driver.findFirst = (async (args: any) => {
      if (args.where.id === 'driver-standalone-uuid') {
        return {
          id: 'driver-standalone-uuid',
          first_name: 'Standalone',
          last_name: 'Driver',
          isActive: true,
        };
      }
      return null;
    }) as any;

    const token = jwt.sign(
      { id: 'driver-standalone-uuid', driver_id: 'driver-standalone-uuid', role: 'Driver' },
      env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    const { res } = createMockRes();

    await authenticateJWT(req, res, next);

    assert.equal(nextCalled, true);
    assert.ok(req.user);
    assert.equal(req.user.id, 'driver-standalone-uuid');
    assert.equal(req.user.driver_id, 'driver-standalone-uuid');
    assert.equal(req.user.role, 'Driver');
    assert.equal(req.user.name, 'Standalone Driver');
  });

  await t.test('Case D: Nonexistent driver_id in Standalone Driver JWT fails with 401 ACCOUNT_INACTIVE', async () => {
    prisma.user.findUnique = (async () => null) as any;
    prisma.driver.findFirst = (async () => null) as any;

    const token = jwt.sign(
      { id: 'nonexistent-driver', driver_id: 'nonexistent-driver', role: 'Driver' },
      env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    const { res, getResult } = createMockRes();

    await authenticateJWT(req, res, next);

    assert.equal(nextCalled, false);
    const result = getResult();
    assert.equal(result.status, 401);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'ACCOUNT_INACTIVE');
  });

  await t.test('Case E: Inactive Driver fails with 401 ACCOUNT_INACTIVE', async () => {
    prisma.user.findUnique = (async () => null) as any;
    prisma.driver.findFirst = (async (args: any) => {
      if (args.where.id === 'driver-inactive-uuid') {
        return {
          id: 'driver-inactive-uuid',
          first_name: 'Inactive',
          last_name: 'Driver',
          isActive: false,
        };
      }
      return null;
    }) as any;

    const token = jwt.sign(
      { id: 'driver-inactive-uuid', driver_id: 'driver-inactive-uuid', role: 'Driver' },
      env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    const { res, getResult } = createMockRes();

    await authenticateJWT(req, res, next);

    assert.equal(nextCalled, false);
    const result = getResult();
    assert.equal(result.status, 401);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'ACCOUNT_INACTIVE');
  });

  await t.test('Case F: Non-Driver (Admin/Operator) authentication works with driver_id set to null', async () => {
    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-uuid-1') {
        return {
          id: 'admin-uuid-1',
          role: 'Admin',
          isActive: true,
          isSuperAdmin: false,
          name: 'Admin User',
          email: 'admin@mercon.tech',
          username: 'admin',
        };
      }
      return null;
    }) as any;
    prisma.driver.findFirst = (async () => null) as any;

    const token = jwt.sign(
      { id: 'admin-uuid-1', role: 'Admin' },
      env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };
    const { res } = createMockRes();

    await authenticateJWT(req, res, next);

    assert.equal(nextCalled, true);
    assert.ok(req.user);
    assert.equal(req.user.id, 'admin-uuid-1');
    assert.equal(req.user.role, 'Admin');
    assert.equal(req.user.driver_id, null);
  });
});
