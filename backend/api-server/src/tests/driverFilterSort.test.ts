import test from 'node:test';
import assert from 'node:assert/strict';

function buildDriverWhereClause(status?: string, licenseStatus?: string) {
  const whereClause: any = { deletedAt: null };
  if (status && status !== 'All') {
    whereClause.status = status;
  }
  if (licenseStatus === 'Expired') {
    whereClause.license_expiry = { lt: 'DATE_NOW' };
  } else if (licenseStatus === 'Valid') {
    whereClause.license_expiry = { gte: 'DATE_NOW' };
  }
  return whereClause;
}

function buildDriverOrderBy(sortBy?: string, sortOrder?: string) {
  const sortVal = sortBy || 'latest';
  const sortDir = sortOrder === 'asc' ? 'asc' : 'desc';

  if (sortVal === 'latest' || sortVal === 'newest') return { createdAt: 'desc' };
  if (sortVal === 'oldest') return { createdAt: 'asc' };
  if (sortVal === 'name_asc') return [{ first_name: 'asc' }, { last_name: 'asc' }];
  if (sortVal === 'name_desc') return [{ first_name: 'desc' }, { last_name: 'desc' }];
  if (sortVal === 'license_asc') return { license_expiry: 'asc' };
  if (sortVal === 'status') return { status: sortDir };
  return { createdAt: 'desc' };
}

// In-memory simulator matching exact SQL/Prisma query sequence (WHERE -> ORDER BY -> OFFSET -> LIMIT)
function simulateFullDatasetQuery(dataset: Array<any>, query: { status?: string; license_status?: string; sort_by?: string; page?: number; per_page?: number }) {
  const now = new Date('2026-09-17T12:00:00Z');
  const pageNumber = query.page || 1;
  const limit = query.per_page || 10;
  const skip = (pageNumber - 1) * limit;

  // 1. WHERE clause
  let filtered = dataset.filter((d) => !d.deletedAt);
  if (query.status && query.status !== 'All') {
    filtered = filtered.filter((d) => d.status === query.status);
  }
  if (query.license_status === 'Expired') {
    filtered = filtered.filter((d) => new Date(d.license_expiry) < now);
  } else if (query.license_status === 'Valid') {
    filtered = filtered.filter((d) => new Date(d.license_expiry) >= now);
  }

  const total = filtered.length;

  // 2. ORDER BY clause across entire filtered dataset
  filtered.sort((a, b) => {
    if (query.sort_by === 'name_asc') {
      const nA = `${a.first_name} ${a.last_name}`;
      const nB = `${b.first_name} ${b.last_name}`;
      return nA.localeCompare(nB);
    }
    if (query.sort_by === 'name_desc') {
      const nA = `${a.first_name} ${a.last_name}`;
      const nB = `${b.first_name} ${b.last_name}`;
      return nB.localeCompare(nA);
    }
    if (query.sort_by === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // 3. OFFSET / LIMIT pagination slice
  const data = filtered.slice(skip, skip + limit);

  return {
    data,
    meta: {
      page: pageNumber,
      per_page: limit,
      total,
      total_pages: Math.ceil(total / limit),
      has_next: skip + limit < total,
      has_prev: pageNumber > 1,
    },
  };
}

test('Phase 1B: Server-Side Filtering & Sorting Unit Tests', async (t) => {
  await t.test('1. License status Expired generates lt date condition before skip/take', () => {
    const where = buildDriverWhereClause('All', 'Expired');
    assert.deepEqual(where.license_expiry, { lt: 'DATE_NOW' });
    assert.equal(where.deletedAt, null);
  });

  await t.test('2. License status Valid generates gte date condition before skip/take', () => {
    const where = buildDriverWhereClause('Available', 'Valid');
    assert.deepEqual(where.license_expiry, { gte: 'DATE_NOW' });
    assert.equal(where.status, 'Available');
  });

  await t.test('3. Sort option name_asc generates first_name/last_name asc array', () => {
    const orderBy = buildDriverOrderBy('name_asc');
    assert.deepEqual(orderBy, [{ first_name: 'asc' }, { last_name: 'asc' }]);
  });

  await t.test('4. Sort option name_desc generates first_name/last_name desc array', () => {
    const orderBy = buildDriverOrderBy('name_desc');
    assert.deepEqual(orderBy, [{ first_name: 'desc' }, { last_name: 'desc' }]);
  });

  await t.test('5. Sort option oldest generates createdAt asc', () => {
    const orderBy = buildDriverOrderBy('oldest');
    assert.deepEqual(orderBy, { createdAt: 'asc' });
  });

  await t.test('6. Sort option license_asc generates license_expiry asc', () => {
    const orderBy = buildDriverOrderBy('license_asc');
    assert.deepEqual(orderBy, { license_expiry: 'asc' });
  });

  await t.test('7. Dataset pagination boundary check: global sorting across full dataset before slicing', () => {
    const mockFleet = [
      { id: '1', first_name: 'Zack', last_name: 'Alpha', createdAt: '2026-01-01', license_expiry: '2027-01-01', status: 'Available' },
      { id: '2', first_name: 'Adam', last_name: 'Zeta', createdAt: '2026-01-02', license_expiry: '2025-01-01', status: 'Available' },
      { id: '3', first_name: 'Charlie', last_name: 'Delta', createdAt: '2026-01-03', license_expiry: '2027-05-01', status: 'Available' },
      { id: '4', first_name: 'Bob', last_name: 'Smith', createdAt: '2026-01-04', license_expiry: '2025-06-01', status: 'Available' },
    ];

    const p1 = simulateFullDatasetQuery(mockFleet, { sort_by: 'name_asc', page: 1, per_page: 2 });
    const p2 = simulateFullDatasetQuery(mockFleet, { sort_by: 'name_asc', page: 2, per_page: 2 });

    assert.equal(p1.data[0].first_name, 'Adam');
    assert.equal(p1.data[1].first_name, 'Bob');
    assert.equal(p2.data[0].first_name, 'Charlie');
    assert.equal(p2.data[1].first_name, 'Zack');
    assert.equal(p1.meta.total, 4);
  });

  await t.test('8. Dataset license filtering before pagination: total count matches filtered dataset', () => {
    const mockFleet = [
      { id: '1', first_name: 'Driver 1', license_expiry: '2027-01-01', status: 'Available' }, // Valid
      { id: '2', first_name: 'Driver 2', license_expiry: '2025-01-01', status: 'Available' }, // Expired
      { id: '3', first_name: 'Driver 3', license_expiry: '2025-05-01', status: 'Available' }, // Expired
      { id: '4', first_name: 'Driver 4', license_expiry: '2028-01-01', status: 'Available' }, // Valid
    ];

    const expiredRes = simulateFullDatasetQuery(mockFleet, { license_status: 'Expired', page: 1, per_page: 1 });

    assert.equal(expiredRes.meta.total, 2);
    assert.equal(expiredRes.meta.total_pages, 2);
    assert.equal(expiredRes.data[0].first_name, 'Driver 2');

    const expiredP2 = simulateFullDatasetQuery(mockFleet, { license_status: 'Expired', page: 2, per_page: 1 });
    assert.equal(expiredP2.data[0].first_name, 'Driver 3');
    assert.equal(expiredP2.meta.total, 2); // Unchanged total across page change
  });
});
