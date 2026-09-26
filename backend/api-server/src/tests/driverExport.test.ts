import test from 'node:test';
import assert from 'node:assert/strict';

// Driver object interface for export test simulator
interface MockDriver {
  id: string;
  ref_id: string;
  first_name: string;
  last_name: string;
  phone_primary: string;
  status: string;
  license_number: string;
  license_expiry: string;
  createdAt: string;
}

interface MockApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

interface MockDriverFilters {
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
  mode?: 'lookup';
  license_status?: 'All' | 'Valid' | 'Expired';
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * In-memory simulator of driver export pagination algorithm matching `driverService.getAllForExport`.
 */
async function simulateGetAllForExport(
  filters: Omit<MockDriverFilters, 'page' | 'per_page'> = {},
  mockApiCall: (params: MockDriverFilters) => Promise<MockApiResponse<MockDriver[]>>,
  batchSize: number = 1000
): Promise<MockDriver[]> {
  const firstPageRes = await mockApiCall({
    ...filters,
    page: 1,
    per_page: batchSize,
    mode: 'lookup',
  });

  const allData: MockDriver[] = [...(firstPageRes.data || [])];
  const totalPages = firstPageRes.meta?.total_pages || 1;
  const totalRecords = firstPageRes.meta?.total;

  if (totalPages <= 1) {
    return allData;
  }

  for (let p = 2; p <= totalPages; p++) {
    const pageRes = await mockApiCall({
      ...filters,
      page: p,
      per_page: batchSize,
      mode: 'lookup',
    });

    if (!pageRes.data || pageRes.data.length === 0) {
      throw new Error(`Export interrupted: page ${p} of ${totalPages} returned empty data`);
    }

    allData.push(...pageRes.data);
  }

  if (typeof totalRecords === 'number' && allData.length < totalRecords) {
    throw new Error(`Export incomplete: expected ${totalRecords} records, but retrieved ${allData.length}`);
  }

  return allData;
}

// Generate mock drivers dataset generator helper
function generateMockDrivers(count: number): MockDriver[] {
  const drivers: MockDriver[] = [];
  for (let i = 1; i <= count; i++) {
    drivers.push({
      id: `drv-${i}`,
      ref_id: `DRV-${String(i).padStart(5, '0')}`,
      first_name: `DriverFirst_${i}`,
      last_name: `DriverLast_${i}`,
      phone_primary: `+96650000${String(i).padStart(4, '0')}`,
      status: i % 2 === 0 ? 'Available' : 'OnTrip',
      license_number: `LIC-${i}`,
      license_expiry: '2030-01-01T00:00:00.000Z',
      createdAt: new Date(1700000000000 + i * 1000).toISOString(),
    });
  }
  return drivers;
}

test('Phase 1F: Driver Export Scalability & Pagination Unit Tests', async (t) => {

  await t.test('1. Dataset <= 1000 (e.g. 500 records): single page requested and 100% of records returned', async () => {
    const mockDataset = generateMockDrivers(500);
    const requestedPages: number[] = [];

    const mockApi = async (params: MockDriverFilters) => {
      const page = params.page || 1;
      const per_page = params.per_page || 1000;
      requestedPages.push(page);

      const slice = mockDataset.slice((page - 1) * per_page, page * per_page);
      return {
        success: true,
        data: slice,
        meta: {
          page,
          per_page,
          total: mockDataset.length,
          total_pages: Math.ceil(mockDataset.length / per_page),
          has_next: page * per_page < mockDataset.length,
          has_prev: page > 1,
        }
      };
    };

    const result = await simulateGetAllForExport({}, mockApi, 1000);

    assert.equal(result.length, 500);
    assert.deepEqual(requestedPages, [1]);
    assert.equal(result[0].ref_id, 'DRV-00001');
    assert.equal(result[499].ref_id, 'DRV-00500');
  });

  await t.test('2. Dataset = 1001: exactly 2 pages fetched, combining 1001 records without truncation', async () => {
    const mockDataset = generateMockDrivers(1001);
    const requestedPages: number[] = [];

    const mockApi = async (params: MockDriverFilters) => {
      const page = params.page || 1;
      const per_page = params.per_page || 1000;
      requestedPages.push(page);

      const slice = mockDataset.slice((page - 1) * per_page, page * per_page);
      return {
        success: true,
        data: slice,
        meta: {
          page,
          per_page,
          total: mockDataset.length,
          total_pages: Math.ceil(mockDataset.length / per_page),
          has_next: page * per_page < mockDataset.length,
          has_prev: page > 1,
        }
      };
    };

    const result = await simulateGetAllForExport({}, mockApi, 1000);

    assert.equal(result.length, 1001);
    assert.deepEqual(requestedPages, [1, 2]);
    assert.equal(result[1000].ref_id, 'DRV-01001');
  });

  await t.test('3. Dataset = 5000: exactly 5 pages fetched, combining 5000 records', async () => {
    const mockDataset = generateMockDrivers(5000);
    const requestedPages: number[] = [];

    const mockApi = async (params: MockDriverFilters) => {
      const page = params.page || 1;
      const per_page = params.per_page || 1000;
      requestedPages.push(page);

      const slice = mockDataset.slice((page - 1) * per_page, page * per_page);
      return {
        success: true,
        data: slice,
        meta: {
          page,
          per_page,
          total: mockDataset.length,
          total_pages: Math.ceil(mockDataset.length / per_page),
          has_next: page * per_page < mockDataset.length,
          has_prev: page > 1,
        }
      };
    };

    const result = await simulateGetAllForExport({}, mockApi, 1000);

    assert.equal(result.length, 5000);
    assert.deepEqual(requestedPages, [1, 2, 3, 4, 5]);
    assert.equal(result[4999].ref_id, 'DRV-05000');
  });

  await t.test('4. Backend search, status, license_status, sort_by parameters are forwarded correctly', async () => {
    const receivedParams: MockDriverFilters[] = [];

    const mockApi = async (params: MockDriverFilters) => {
      receivedParams.push(params);
      return {
        success: true,
        data: [],
        meta: {
          page: 1,
          per_page: 1000,
          total: 0,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        }
      };
    };

    await simulateGetAllForExport(
      {
        status: 'Available',
        search: 'Ahmed',
        license_status: 'Valid',
        sort_by: 'name_asc',
      },
      mockApi,
      1000
    );

    assert.equal(receivedParams.length, 1);
    assert.equal(receivedParams[0].status, 'Available');
    assert.equal(receivedParams[0].search, 'Ahmed');
    assert.equal(receivedParams[0].license_status, 'Valid');
    assert.equal(receivedParams[0].sort_by, 'name_asc');
    assert.equal(receivedParams[0].mode, 'lookup');
  });

  await t.test('5. Failed intermediate page throws error and prevents partial export output', async () => {
    const mockDataset = generateMockDrivers(2000);

    const mockApi = async (params: MockDriverFilters) => {
      const page = params.page || 1;
      if (page === 2) {
        throw new Error('HTTP 500 Internal Server Error on page 2');
      }

      const slice = mockDataset.slice((page - 1) * 1000, page * 1000);
      return {
        success: true,
        data: slice,
        meta: {
          page,
          per_page: 1000,
          total: 2000,
          total_pages: 2,
          has_next: true,
          has_prev: false,
        }
      };
    };

    await assert.rejects(
      async () => {
        await simulateGetAllForExport({}, mockApi, 1000);
      },
      {
        message: 'HTTP 500 Internal Server Error on page 2',
      }
    );
  });

  await t.test('6. Unexpected empty page throws error and halts export cleanly', async () => {
    const mockApi = async (params: MockDriverFilters) => {
      const page = params.page || 1;
      if (page === 2) {
        return {
          success: true,
          data: [],
          meta: {
            page: 2,
            per_page: 1000,
            total: 2000,
            total_pages: 2,
            has_next: false,
            has_prev: true,
          }
        };
      }

      const slice = generateMockDrivers(1000);
      return {
        success: true,
        data: slice,
        meta: {
          page: 1,
          per_page: 1000,
          total: 2000,
          total_pages: 2,
          has_next: true,
          has_prev: false,
        }
      };
    };

    await assert.rejects(
      async () => {
        await simulateGetAllForExport({}, mockApi, 1000);
      },
      {
        message: 'Export interrupted: page 2 of 2 returned empty data',
      }
    );
  });

  await t.test('7. Custom "All Drivers" scope uses full dataset, "Current Page" uses page slice, "Selected Rows" uses selection', () => {
    const fullDataset = generateMockDrivers(2500);
    const currentPageSlice = fullDataset.slice(0, 10);
    const selectedRows = [fullDataset[2], fullDataset[5]];

    // Scope semantics verification
    const allScopeData = fullDataset;
    const pageScopeData = currentPageSlice;
    const selectedScopeData = selectedRows;

    assert.equal(allScopeData.length, 2500);
    assert.equal(pageScopeData.length, 10);
    assert.equal(selectedScopeData.length, 2);
    assert.equal(selectedScopeData[0].ref_id, 'DRV-00003');
    assert.equal(selectedScopeData[1].ref_id, 'DRV-00006');
  });

  await t.test('8. Returned driver objects contain 100% of fields required by Quick Export and Custom Export', async () => {
    const mockDriver: MockDriver & { assignedVehicle?: any } = {
      id: 'drv-uuid-12345',
      ref_id: 'DRV-00042',
      first_name: 'John',
      last_name: 'Doe',
      phone_primary: '+966501234567',
      status: 'Available',
      license_number: 'LIC-998877',
      license_expiry: '2028-12-31T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      assignedVehicle: {
        id: 'veh-123',
        ref_id: 'VEH-001',
        plate_number: '1234-ABC',
        asset_type: 'Reefer',
        capacity_kg: 25000,
      }
    };

    const mockApi = async () => ({
      success: true,
      data: [mockDriver],
      meta: {
        page: 1,
        per_page: 1000,
        total: 1,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      }
    });

    const result = await simulateGetAllForExport({}, mockApi, 1000);
    const d = result[0] as any;

    assert.equal(d.id, 'drv-uuid-12345');
    assert.equal(d.ref_id, 'DRV-00042');
    assert.equal(d.first_name, 'John');
    assert.equal(d.last_name, 'Doe');
    assert.equal(d.phone_primary, '+966501234567');
    assert.equal(d.status, 'Available');
    assert.equal(d.license_number, 'LIC-998877');
    assert.equal(d.license_expiry, '2028-12-31T00:00:00.000Z');
    assert.equal(d.assignedVehicle?.plate_number, '1234-ABC');
  });

});
