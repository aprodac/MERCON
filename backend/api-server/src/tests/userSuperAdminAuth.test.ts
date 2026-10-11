import test from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { createUser, updateUser, deleteUser } from '../controllers/userController';
import { AuthenticatedRequest } from '../middlewares/auth';
import { prisma } from '../db';

// Helper to execute controller with mock req/res and stubbed Prisma queries
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

test('User Controller - SuperAdmin Escalation Protection Suite', async (t) => {
  // Store original prisma methods to restore after tests
  const origFindUnique = prisma.user.findUnique;
  const origFindFirst = prisma.user.findFirst;
  const origCreate = prisma.user.create;
  const origUpdate = prisma.user.update;
  const origDelete = prisma.user.delete;
  const origCount = prisma.user.count;
  const origAuditLogCreate = prisma.auditLog.create;

  t.beforeEach(() => {
    prisma.auditLog.create = (async () => ({ id: 'mock-audit-id' })) as any;
  });

  t.after(() => {
    prisma.user.findUnique = origFindUnique;
    prisma.user.findFirst = origFindFirst;
    prisma.user.create = origCreate;
    prisma.user.update = origUpdate;
    prisma.user.delete = origDelete;
    prisma.user.count = origCount;
    prisma.auditLog.create = origAuditLogCreate;
  });

  await t.test('1. Admin creates Admin -> ALLOWED', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      body: { name: 'New Admin', phone: '+966500000001', role: 'Admin', password: 'Password123' },
    } as AuthenticatedRequest;

    prisma.user.findUnique = (async () => ({ id: 'admin-id-1', role: 'Admin', isSuperAdmin: false })) as any;
    prisma.user.findFirst = (async () => null) as any;
    prisma.user.create = (async (args: any) => ({
      id: 'new-admin-id',
      name: args.data.name,
      username: 'newadmin',
      phone: args.data.phone,
      email: null,
      role: args.data.role,
      isActive: true,
      isSuperAdmin: false,
    })) as any;

    const { res, getResult } = createMockRes();
    await createUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.role, 'Admin');
  });

  await t.test('2. Admin creates Operator -> ALLOWED', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      body: { name: 'New Op', phone: '+966500000002', role: 'Operator', password: 'Password123' },
    } as AuthenticatedRequest;

    prisma.user.findUnique = (async () => ({ id: 'admin-id-1', role: 'Admin', isSuperAdmin: false })) as any;
    prisma.user.findFirst = (async () => null) as any;
    prisma.user.create = (async (args: any) => ({
      id: 'new-op-id',
      name: args.data.name,
      username: 'newop',
      phone: args.data.phone,
      email: null,
      role: args.data.role,
      isActive: true,
      isSuperAdmin: false,
    })) as any;

    const { res, getResult } = createMockRes();
    await createUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.role, 'Operator');
  });

  await t.test('3. Admin creates SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      body: { name: 'Evil SA', phone: '+966500000003', role: 'SuperAdmin', password: 'Password123' },
    } as AuthenticatedRequest;

    prisma.user.findUnique = (async () => ({ id: 'admin-id-1', role: 'Admin', isSuperAdmin: false })) as any;

    const { res, getResult } = createMockRes();
    await createUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
    assert.equal(result.body.error.message, 'Only a SuperAdmin can create a SuperAdmin account');
  });

  await t.test('4. SuperAdmin creates SuperAdmin -> ALLOWED', async () => {
    const req = {
      user: { id: 'superadmin-id-1' },
      body: { name: 'Legit SA', phone: '+966500000004', role: 'SuperAdmin', password: 'Password123' },
    } as AuthenticatedRequest;

    prisma.user.findUnique = (async () => ({ id: 'superadmin-id-1', role: 'SuperAdmin', isSuperAdmin: true })) as any;
    prisma.user.findFirst = (async () => null) as any;
    prisma.user.create = (async (args: any) => ({
      id: 'new-sa-id',
      name: args.data.name,
      username: 'legitsa',
      phone: args.data.phone,
      email: null,
      role: args.data.role,
      isActive: true,
      isSuperAdmin: true,
    })) as any;

    const { res, getResult } = createMockRes();
    await createUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.role, 'SuperAdmin');
  });

  await t.test('5. Admin changes Operator -> Admin -> ALLOWED', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'op-target-id' },
      body: { role: 'Admin' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'op-target-id', role: 'Operator', isSuperAdmin: false };
    }) as any;

    prisma.user.update = (async (args: any) => ({
      id: 'op-target-id',
      name: 'Op User',
      email: null,
      role: args.data.role,
      isActive: true,
      isSuperAdmin: false,
    })) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.role, 'Admin');
  });

  await t.test('6. Admin changes Admin -> Operator -> ALLOWED', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'other-admin-id' },
      body: { role: 'Operator' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'other-admin-id', role: 'Admin', isSuperAdmin: false };
    }) as any;

    prisma.user.update = (async (args: any) => ({
      id: 'other-admin-id',
      name: 'Admin User 2',
      email: null,
      role: args.data.role,
      isActive: true,
      isSuperAdmin: false,
    })) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.role, 'Operator');
  });

  await t.test('7. Admin promotes Operator -> SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'op-target-id' },
      body: { role: 'SuperAdmin' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'op-target-id', role: 'Operator', isSuperAdmin: false };
    }) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
    assert.equal(result.body.error.message, 'Only a SuperAdmin can assign the SuperAdmin role');
  });

  await t.test('8. Admin promotes Admin -> SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'admin-target-id' },
      body: { role: 'SuperAdmin' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'admin-target-id', role: 'Admin', isSuperAdmin: false };
    }) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
  });

  await t.test('9. Admin promotes Driver -> SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'driver-target-id' },
      body: { role: 'SuperAdmin' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'driver-target-id', role: 'Driver', isSuperAdmin: false };
    }) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    // Driver logins are refused outright now — they're managed from the Drivers page.
    assert.equal(result.body.error.code, 'DRIVER_ACCOUNT');
  });

  await t.test('10. Admin promotes SELF -> SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'admin-id-1' },
      body: { role: 'SuperAdmin' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async () => ({ id: 'admin-id-1', role: 'Admin', isSuperAdmin: false })) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
    assert.equal(result.body.error.message, 'Only a SuperAdmin can assign the SuperAdmin role');
  });

  await t.test('11. SuperAdmin promotes normal user -> SuperAdmin -> ALLOWED', async () => {
    const req = {
      user: { id: 'superadmin-id-1' },
      params: { id: 'admin-target-id' },
      body: { role: 'SuperAdmin' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'superadmin-id-1') return { id: 'superadmin-id-1', role: 'SuperAdmin', isSuperAdmin: true };
      return { id: 'admin-target-id', role: 'Admin', isSuperAdmin: false };
    }) as any;

    prisma.user.update = (async (args: any) => ({
      id: 'admin-target-id',
      name: 'Promoted User',
      email: null,
      role: args.data.role,
      isActive: true,
      isSuperAdmin: false,
    })) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.role, 'SuperAdmin');
  });

  await t.test('12. Admin sets isSuperAdmin = true -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'admin-target-id' },
      body: { isSuperAdmin: true },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'admin-target-id', role: 'Admin', isSuperAdmin: false };
    }) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
  });

  await t.test('13. Admin sets isSuperAdmin = false -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'admin-target-id' },
      body: { isSuperAdmin: false },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'admin-target-id', role: 'Admin', isSuperAdmin: false };
    }) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
  });

  await t.test('14. SuperAdmin grants/revokes isSuperAdmin -> ALLOWED', async () => {
    const req = {
      user: { id: 'superadmin-id-1' },
      params: { id: 'admin-target-id' },
      body: { isSuperAdmin: true },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'superadmin-id-1') return { id: 'superadmin-id-1', role: 'SuperAdmin', isSuperAdmin: true };
      return { id: 'admin-target-id', role: 'Admin', isSuperAdmin: false };
    }) as any;

    prisma.user.update = (async (args: any) => ({
      id: 'admin-target-id',
      name: 'User',
      email: null,
      role: 'Admin',
      isActive: true,
      isSuperAdmin: args.data.isSuperAdmin,
    })) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.isSuperAdmin, true);
  });

  await t.test('15. Admin modifies existing SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'sa-target-id' },
      body: { name: 'Attempt Change' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'sa-target-id', role: 'SuperAdmin', isSuperAdmin: true };
    }) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
  });

  await t.test('16. Admin deletes existing SuperAdmin -> 403 FORBIDDEN', async () => {
    const req = {
      user: { id: 'admin-id-1' },
      params: { id: 'sa-target-id' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'admin-id-1') return { id: 'admin-id-1', role: 'Admin', isSuperAdmin: false };
      return { id: 'sa-target-id', role: 'SuperAdmin', isSuperAdmin: true };
    }) as any;

    const { res, getResult } = createMockRes();
    await deleteUser(req, res);

    const result = getResult();
    assert.equal(result.status, 403);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error.code, 'FORBIDDEN');
  });

  await t.test('17. SuperAdmin modifies existing SuperAdmin -> ALLOWED', async () => {
    const req = {
      user: { id: 'superadmin-id-1' },
      params: { id: 'superadmin-id-2' },
      body: { name: 'Updated SA Name' },
    } as unknown as AuthenticatedRequest;

    prisma.user.findUnique = (async (args: any) => {
      if (args.where.id === 'superadmin-id-1') return { id: 'superadmin-id-1', role: 'SuperAdmin', isSuperAdmin: true };
      return { id: 'superadmin-id-2', role: 'SuperAdmin', isSuperAdmin: true };
    }) as any;

    prisma.user.update = (async (args: any) => ({
      id: 'superadmin-id-2',
      name: args.data.name,
      email: null,
      role: 'SuperAdmin',
      isActive: true,
      isSuperAdmin: true,
    })) as any;

    const { res, getResult } = createMockRes();
    await updateUser(req, res);

    const result = getResult();
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.name, 'Updated SA Name');
  });
});
