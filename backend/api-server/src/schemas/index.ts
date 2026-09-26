import { z } from 'zod';

/* ─── Shared building blocks ─────────────────────────────────────────────── */

/** A required, trimmed, non-empty string. Safely coerces numbers to strings in Excel imports. */
const nonEmpty = (label = 'Value') =>
  z.preprocess(
    (val) => (val === null || val === undefined ? val : String(val)),
    z.string().trim().min(1, `${label} is required`)
  );

/** Normalises asset types from variations like "BOX-TRUCK" or "Flatbed Trailer" to the allowed database enums. */
const normaliseAssetType = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const s = val.trim().toLowerCase();
  if (!s || s === 'nil' || s === 'nill' || s === 'none' || s === 'n/a') return undefined;
  if (s.includes('box')) return 'Box';
  if (s.includes('reefer')) return 'Reefer';
  if (s.includes('flatbed')) return 'Flatbed';
  if (s.includes('tanker')) return 'Tanker';
  return val;
};

/** Preprocessor for numeric cells that handles Excel number representations, formatted commas (e.g., "10,000"), and empty placeholders like "NIL". */
const coercedNumber = (schema: z.ZodTypeAny) =>
  z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const clean = val.replace(/,/g, '').trim();
      const lower = clean.toLowerCase();
      if (lower === 'nil' || lower === 'nill' || clean === '—' || clean === '-' || lower === 'none') {
        return undefined;
      }
      const num = Number(clean);
      return isNaN(num) ? val : num;
    }
    return val;
  }, schema);

/** Preprocessor for optional string fields that normalises placeholder values like "NIL" or "NILL" to undefined so they are ignored. */
const safeImportString = (schema: z.ZodTypeAny) =>
  z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    const s = String(val).trim();
    const lower = s.toLowerCase();
    if (!s || lower === 'nil' || lower === 'nill' || lower === 'none' || lower === 'n/a' || s === '—' || s === '-') {
      return undefined;
    }
    return s;
  }, schema);

/**
 * Tonnage tier / trip-shape / billing-frequency fields. All three are
 * nullable free-text columns on RateCard and Trip. VEHICLE_TYPES/
 * RATE_CATEGORIES/BILLING_TYPES in @mercon/shared-types are the *offered*
 * dropdown options, not a hard restriction — every create/edit form also has
 * a "Custom" free-text toggle, so this must accept whatever that sends
 * rather than reject it. Empty string clears the field.
 */
export const vehicleTypeField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(60).nullable().optional()
);
export const rateCategoryField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(60).nullable().optional()
);
export const lineTypeField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(60).nullable().optional()
);
export const billingTypeField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(60).nullable().optional()
);
export const pricingBasisField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(60).nullable().optional()
);
export const vehicleClassField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(60).nullable().optional()
);
export const sourceVehicleLabelField = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().trim().max(120).nullable().optional()
);



const saudiPlateSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return val;
  return val.trim().toUpperCase();
}, z.string().refine((val) => {
  return val.length >= 2 && /^[A-Z0-9\s_-]{2,20}$/i.test(val);
}, {
  message: 'Invalid Saudi vehicle plate (e.g., DRA-6484 or 1234 ABC)',
}));

const saudiTrailerPlateSchema = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val !== 'string') return val;
  return val.trim().toUpperCase();
}, z.string().refine((val) => {
  return val.length >= 2 && /^[A-Z0-9\s_-]{2,20}$/i.test(val);
}, {
  message: 'Invalid Saudi trailer plate (e.g., DRA-6484 or 1234 ABC)',
}).optional().nullable());

const saudiPhoneSchema = z.preprocess(
  (val) => (val === null || val === undefined ? val : String(val)),
  z.string().refine((val) => {
    const clean = val.replace(/[\s-]/g, '');
    return /^(\+966|00966|0)?5\d{8}$/.test(clean);
  }, {
    message: 'Invalid Saudi phone number. Must be exactly 9 digits starting with 5 (e.g., +966 500000000)',
  })
);

const saudiLicenseSchema = z.preprocess(
  (val) => (val === null || val === undefined ? val : String(val)),
  z.string().refine((val) => {
    return /^[12]\d{9}$/.test(val.trim());
  }, {
    message: 'Invalid Saudi ID/Iqama/License number. Must be exactly 10 digits starting with 1 or 2',
  })
);

/** Route param `:id` must be a UUID. */
export const idParam = z.object({ id: z.string().uuid('Invalid id') });

/** List query — pagination + search + sort. Coerces and guards against NaN. */
export const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(5000).default(20),
  search: z.string().trim().optional(),
  sort_by: z.string().trim().optional(),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  sort_order: z.enum(['asc', 'desc']).optional(),
  status: z.string().trim().optional(),
  license_status: z.enum(['All', 'Valid', 'Expired']).optional(),
  license_filter: z.enum(['All', 'Valid', 'Expired']).optional(),
  customer_id: z.string().uuid().optional(),
}).passthrough();

/* ─── Auth ───────────────────────────────────────────────────────────────── */
export const loginBody = z.object({
  username: nonEmpty('Username'),
  password: nonEmpty('Password'),
});

/* ─── Trips ──────────────────────────────────────────────────────────────── */
export const createTripBody = z.object({
  customer_id: z.string().uuid('A valid customer is required'),
  driver_id: z.string().uuid('Invalid driver').optional(),
  co_driver_id: z.string().uuid('Invalid co-driver').nullable().optional(),
  vehicle_id: z.string().uuid('Invalid vehicle').optional(),
  planned_start: z.coerce.date().optional(),
  planned_end: z.coerce.date().optional(),
  billing_amount: z.coerce.number().optional(),
  driver_charge: z.coerce.number().optional(),
  trip_charges: z.coerce.number().optional(),
  co_driver_payout: z.coerce.number().optional(),
  status: z.enum(['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Completed', 'Invoiced', 'Cancelled', 'Draft']).optional(),
  dispatch_now: z.boolean().optional(),
  // The rate card the dispatcher was shown. Recorded on the trip so invoicing
  // bills what was quoted instead of re-deriving it later.
  rate_card_id: z.string().uuid('Invalid rate card').optional(),
  pricing_rule_id: z.string().uuid('Invalid pricing rule').optional(),
  quotation_id: z.string().uuid('Invalid quotation').optional(),
  // The tonnage tier / booking type the dispatcher selected — drives which
  // rate card gets auto-matched when rate_card_id isn't sent, and is copied
  // onto the trip regardless so it survives that rate card being edited later.
  // Free text, not the shared VEHICLE_TYPES/RATE_CATEGORIES enum: the Create
  // Trip form's dropdown offers its own short list plus a "Custom" free-text
  // toggle, neither of which is guaranteed to match those RateCard-oriented enums.
  vehicle_type: z.string().trim().max(60).nullable().optional(),
  rate_category: z.string().trim().max(60).nullable().optional(),
  // Whether this trip is a one-off "Extra" job or part of a standing
  // "Monthly" commitment — see BILLING_TYPES in @mercon/shared-types.
  operation_type: z.string().trim().max(60).nullable().optional(),
  billing_type: z.string().trim().max(60).nullable().optional(),
  awb_number: z.string().trim().nullable().optional(),
  // Third-Party Logistics & Rental fields
  is_third_party: z.boolean().optional(),
  third_party_provider_id: z.string().uuid('Invalid provider').nullable().optional(),
  third_party_driver_name: z.string().trim().optional(),
  third_party_driver_phone: z.string().trim().optional(),
  third_party_vehicle_plate: z.string().trim().optional(),
  third_party_vehicle_type: z.string().trim().optional(),
  third_party_cost: z.coerce.number().optional(),
  charges: z.array(z.object({
    charge_type: z.string().trim().min(1),
    rate: z.coerce.number(),
    quantity: z.coerce.number().optional().default(1),
    amount: z.coerce.number(),
    surchargeRuleId: z.string().uuid().optional(),
  })).optional(),
  stops: z.array(z.object({
    stop_type: z.enum(['Pickup', 'Dropoff', 'Rest', 'Refuel', 'Stop']),
    leg_index: z.number().int().optional(),
    // Client + controller use lat/lng (controller reads stop.lat/stop.lng), not location_*.
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    planned_arrival: z.string().optional(),
    // Human-readable name for this place — the route label in delay reports.
    location_name: z.string().trim().max(120).optional(),
    // Full postal address, handed to the driver's app so they can actually find
    // the place. Longer cap than the name: this is a whole address, not a label.
    location_address: z.string().trim().max(500).optional(),
    // The lane endpoint this stop sits in ("Riyadh"), as opposed to the exact
    // yard within it that location_name/lat/lng describe. This is what the rate
    // card is priced against.
    location_id: z.string().uuid('Invalid location').optional(),
    stop_sequence: z.number().int().optional(),
  })).min(2, 'At least a pickup and a dropoff are required'),
}).refine((data) => {
  if (data.planned_start && data.status !== 'Completed' && data.status !== 'Invoiced' && data.status !== 'InTransit') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const graceTime = today.getTime() - 5 * 60 * 1000;
    return new Date(data.planned_start).getTime() >= graceTime;
  }
  return true;
}, {
  message: 'Trip planned start date must be today or in the future',
  path: ['planned_start'],
}).refine((data) => {
  if (data.planned_start && data.planned_end) {
    return new Date(data.planned_end).getTime() > new Date(data.planned_start).getTime();
  }
  return true;
}, {
  message: 'Drop-off date and time must be strictly later than start date and time',
  path: ['planned_end'],
}).refine((data) => {
  if (data.stops && Array.isArray(data.stops)) {
    const startTime = data.planned_start ? new Date(data.planned_start).getTime() : null;
    const endTime = data.planned_end ? new Date(data.planned_end).getTime() : null;
    let prevTime: number | null = startTime;

    for (let i = 0; i < data.stops.length; i++) {
      const stop = data.stops[i];
      if (stop.planned_arrival) {
        const arrDate = new Date(stop.planned_arrival);
        if (isNaN(arrDate.getTime())) return false;
        const arrTime = arrDate.getTime();
        if (startTime !== null && arrTime < startTime) return false;
        if (endTime !== null && arrTime > endTime) return false;
        if (prevTime !== null && arrTime < prevTime) return false;
        prevTime = arrTime;
      }
    }
  }
  return true;
}, {
  message: 'Stop planned arrivals must follow chronological sequence between trip start and drop-off',
  path: ['stops'],
});

/** Correcting a stop after the trip exists — every field optional, since the
 *  usual case is fixing one wrong address and nothing else. */
export const updateTripStopBody = z.object({
  location_name: z.string().trim().max(120).optional(),
  location_address: z.string().trim().max(500).optional(),
  location_id: z.string().uuid('Invalid location').nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/* ─── Fleet bulk import ───────────────────────────────────────────────────── */

/** Drivers workbook — one driver per row. Columns are mapped to these names by
 *  the client before posting; see docs/MERCON_Fleet_Import_Guide.md.
 *
 *  `phone_primary` is the upsert key: it is the only unique column on Driver
 *  (license_number is not unique in the schema), so re-importing a corrected
 *  workbook updates people rather than duplicating them. */
/** Locations workbook — one lane-endpoint city per row, upserted on slug. */
export const bulkImportLocationsBody = z.object({
  rows: z.array(z.object({
    name: nonEmpty('Location name'),
    code: safeImportString(z.string().trim().max(100).optional()),
    city: safeImportString(z.string().trim().max(100).optional()),
    address: safeImportString(z.string().trim().max(300).optional()),
    postal_code: safeImportString(z.string().trim().max(50).optional()),
    lat: coercedNumber(z.number().min(-90).max(90).optional()),
    lng: coercedNumber(z.number().min(-180).max(180).optional()),
    coordinate_precision: safeImportString(z.string().trim().max(50).optional()),
    codes: safeImportString(z.string().trim().max(500).optional()),
    customer_name: safeImportString(z.string().trim().max(200).optional()),
  })).min(1, 'The file has no rows to import').max(1000, 'Import at most 1000 rows at a time'),
});

/** Surcharge fee schedule workbook — one fee per row, upserted on
 *  customer + rate card + charge type + vehicle type. */
export const bulkImportSurchargeRulesBody = z.object({
  rows: z.array(z.object({
    customer_name: nonEmpty('Customer name'),
    charge_type: nonEmpty('Charge type'),
    unit: safeImportString(z.string().trim().max(60).optional()),
    vehicle_type: safeImportString(z.string().trim().max(60).optional()),
    applies_to: safeImportString(z.string().trim().max(200).optional()),
    rate: coercedNumber(z.number().positive('Rate must be greater than 0')),
    currency: safeImportString(z.string().trim().max(10).optional()),
  })).min(1, 'The file has no rows to import').max(1000, 'Import at most 1000 rows at a time'),
});


export const bulkImportDriversBody = z.object({
  rows: z.array(z.object({
    ref_id: safeImportString(z.string().trim().max(64).optional()),
    first_name: nonEmpty('First name'),
    last_name: nonEmpty('Last name'),
    phone_primary: saudiPhoneSchema,
    license_number: saudiLicenseSchema,
    license_expiry: z.preprocess((val) => (val === null || val === undefined ? val : String(val)), z.string().trim().min(1, 'License expiry is required')),
    assigned_vehicle_plate: safeImportString(z.string().trim().max(32).optional()),
  })).min(1, 'The file has no rows to import').max(1000, 'Import at most 1000 rows at a time'),
});

/** Vehicles workbook — one vehicle per row, upserted on `plate_number`. */
export const bulkImportVehiclesBody = z.object({
  rows: z.array(z.object({
    ref_id: safeImportString(z.string().trim().max(64).optional()),
    plate_number: saudiPlateSchema,
    asset_type: z.preprocess(normaliseAssetType, z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker'], {
      message: 'Asset type must be Flatbed, Reefer, Box or Tanker',
    })),
    capacity_kg: coercedNumber(z.number().int().positive('Capacity must be a positive whole number')),
    current_odometer: coercedNumber(z.number().min(0).optional()),
    icces_device_id: safeImportString(z.string().trim().max(64).optional()),
    trailer_number: saudiTrailerPlateSchema,
    trailer_type: z.preprocess(normaliseAssetType, z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker']).optional()),
    trailer_capacity_kg: coercedNumber(z.number().int().positive().optional()),
    assigned_driver: safeImportString(z.string().trim().max(120).optional()),
  })).min(1, 'The file has no rows to import').max(1000, 'Import at most 1000 rows at a time'),
});

/** Bulk CSV import — one trip per row, matched to existing customers/drivers/
 *  vehicles by name/plate rather than id (the CSV can't know internal ids).
 *  No stops: imported trips land in Draft/Dispatched with route stops added
 *  later through the normal trip edit UI. */
export const bulkImportTripsBody = z.object({
  rows: z.array(z.object({
    customer_id: z.string().trim().nullable().optional(),
    customer_name: z.string().trim().nullable().optional(),
    driver_id: z.string().trim().nullable().optional(),
    driver_name: z.string().trim().nullable().optional(),
    vehicle_id: z.string().trim().nullable().optional(),
    vehicle_plate: z.string().trim().nullable().optional(),
    planned_start: z.string().trim().nullable().optional(),
    planned_end: z.string().trim().nullable().optional(),
    rate_category: z.string().trim().nullable().optional(),
    vehicle_type: z.string().trim().nullable().optional(),
    operation_type: z.string().trim().nullable().optional(),
    billing_type: z.string().trim().nullable().optional(),
    billing_amount: z.coerce.number().nullable().optional(),
    // What MERCON paid its own driver for this specific trip -- unlike
    // quotations' driver_payout (a default allocated for the lane),
    // this is the real, per-trip figure straight from historical records.
    trip_charges: z.coerce.number().nullable().optional(),
    origin: z.string().trim().nullable().optional(),
    destination: z.string().trim().nullable().optional(),
    // 'Completed' is for backfilling historical trips that already happened
    // (e.g. a month's worth of trip logs) so they don't sit on the live ops
    // board looking like an active dispatch.
    status: z.enum(['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Completed', 'Invoiced', 'Cancelled', 'Draft']).optional(),
    is_third_party: z.boolean().optional(),
    third_party_provider_id: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
    third_party_driver_name: z.string().trim().nullable().optional(),
    third_party_driver_phone: z.string().trim().nullable().optional(),
    third_party_vehicle_plate: z.string().trim().nullable().optional(),
    third_party_vehicle_type: z.string().trim().nullable().optional(),
    third_party_cost: z.coerce.number().nullable().optional(),
    rate_card_id: z.string().trim().nullable().optional(),
    quotation_id: z.string().trim().nullable().optional(),
    driver_charge: z.coerce.number().nullable().optional(),
    driver_payout: z.coerce.number().nullable().optional(),
    co_driver_id: z.string().trim().nullable().optional(),
    co_driver_payout: z.coerce.number().nullable().optional(),
    additional_charge: z.coerce.number().nullable().optional(),
    // Extra charges billed on top of billing_amount — same shape as POST /trips.
    charges: z.array(z.object({
      charge_type: z.string().trim().min(1),
      rate: z.coerce.number(),
      quantity: z.coerce.number().optional().default(1),
      amount: z.coerce.number(),
    })).optional(),
    update_quotation_driver_payout: z.boolean().optional(),
    awb_number: z.string().trim().nullable().optional(),
    stops: z.array(z.object({
      stop_sequence: z.number().int().optional(),
      leg_index: z.number().int().optional(),
      stop_type: z.enum(['Pickup', 'Dropoff', 'Rest', 'Refuel']).optional(),
      location_name: z.string().trim().nullable().optional(),
      location_address: z.string().trim().nullable().optional(),
      location_id: z.preprocess((val) => (val === '' ? null : val), z.string().uuid().nullable().optional()),
      lat: z.coerce.number().nullable().optional(),
      lng: z.coerce.number().nullable().optional(),
      planned_arrival: z.string().nullable().optional(),
    })).optional(),
  }).refine((data) => Boolean(data.customer_id || data.customer_name), {
    message: 'Either customer_id or customer_name is required',
  }).refine((data) => {
    if (data.planned_start && data.planned_end) {
      const s = new Date(data.planned_start).getTime();
      const e = new Date(data.planned_end).getTime();
      if (!isNaN(s) && !isNaN(e)) {
        return e >= s;
      }
    }
    return true;
  }, {
    message: 'Drop-off date and time must be later than or equal to start date and time',
    path: ['planned_end'],
  })).min(1, 'At least one row is required').max(500, 'Import is limited to 500 rows at a time'),
});

/** Operator logging why a stop was reached late. Reason is required — the
 *  whole point is replacing "no explanation" with one, and `Other` plus a note
 *  already covers anything the list misses. */
export const logStopDelayBody = z.object({
  delay_reason: z.enum([
    'Traffic', 'VehicleBreakdown', 'CustomerNotReady', 'SlowLoadingUnloading',
    'Weather', 'Documentation', 'RouteBlocked', 'Other',
  ]),
  delay_note: z.string().trim().max(500).optional(),
});

export const confirmEvidenceTimeBody = z.object({
  document_id: z.string().uuid(),
  // Neither is required — an operator confirming the recorded time is
  // already correct submits with both omitted. Not strict ISO validation
  // since a <input type="datetime-local"> sends "YYYY-MM-DDTHH:mm" with no
  // offset; the controller parses with `new Date(...)`.
  actual_arrival: z.string().min(1).optional(),
  actual_departure: z.string().min(1).optional(),
});

/* ─── Drivers ────────────────────────────────────────────────────────────── */
export const createDriverBody = z.object({
  first_name: nonEmpty('First name'),
  last_name: nonEmpty('Last name'),
  phone_primary: saudiPhoneSchema,
  license_number: saudiLicenseSchema,
  license_expiry: z.coerce.date().refine((val) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return val >= today;
  }, {
    message: 'License expiry date must be today or in the future',
  }),
  assigned_vehicle_id: z.string().uuid().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

// Partial update: every field optional, unknown keys stripped, and
// license_expiry coerced to a real Date (Prisma rejects bare date strings).
export const updateDriverBody = z.object({
  first_name: nonEmpty('First name').optional(),
  last_name: nonEmpty('Last name').optional(),
  phone_primary: saudiPhoneSchema.optional(),
  license_number: saudiLicenseSchema.optional(),
  license_expiry: z.coerce.date().refine((val) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return val >= today;
  }, {
    message: 'License expiry date must be today or in the future',
  }).optional(),
  status: z.enum(['Available', 'OnTrip', 'OffDuty', 'Inactive']).optional(),
  assigned_vehicle_id: z.string().uuid().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

/* ─── Customers ──────────────────────────────────────────────────────────── */
export const createCustomerBody = z.object({
  name: nonEmpty('Customer name'),
  contact_phone: nonEmpty('Contact phone'),
  logo_url: z.string().nullable().optional(),
  primary_contact_person: z.string().trim().optional(),
  primary_contact_phone: z.string().trim().optional(),
  secondary_contact_person: z.string().trim().optional(),
  secondary_contact_phone: z.string().trim().optional(),
  payment_terms: z.string().trim().optional(),
  whatsapp_number: z.string().trim().optional(),
  whatsapp_group_link: z.string().trim().optional(),
  whatsapp_group_name: z.string().trim().optional(),
  driver_workflow: z.enum(['NATIVE', 'EXTERNAL_APP']).optional(),
  isActive: z.boolean().optional(),
});

export const updateCustomerBody = z.object({
  name: nonEmpty('Customer name').optional(),
  contact_phone: nonEmpty('Contact phone').optional(),
  logo_url: z.string().nullable().optional(),
  primary_contact_person: z.string().trim().optional(),
  primary_contact_phone: z.string().trim().optional(),
  secondary_contact_person: z.string().trim().optional(),
  secondary_contact_phone: z.string().trim().optional(),
  payment_terms: z.string().trim().optional(),
  whatsapp_number: z.string().trim().optional(),
  whatsapp_group_link: z.string().trim().optional(),
  whatsapp_group_name: z.string().trim().optional(),
  driver_workflow: z.enum(['NATIVE', 'EXTERNAL_APP']).optional(),
  isActive: z.boolean().optional(),
});

/* ─── Vehicles ───────────────────────────────────────────────────────────── */
export const createVehicleBody = z.object({
  plate_number: saudiPlateSchema,
  asset_type: z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker']),
  capacity_kg: z.coerce.number().int().positive('Capacity must be a whole number of kg'),
  trailer_number: saudiTrailerPlateSchema,
  trailer_type: z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker']).optional().nullable(),
  trailer_capacity_kg: z.coerce.number().int().positive().optional().nullable(),
  icces_device_id: z.string().trim().optional().nullable(),
  image_url: z.string().nullable().optional(),
});

export const updateVehicleBody = z.object({
  plate_number: saudiPlateSchema.optional(),
  asset_type: z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker']).optional(),
  capacity_kg: z.coerce.number().int().positive().optional(),
  current_odometer: z.coerce.number().min(0).optional(),
  trailer_number: saudiTrailerPlateSchema,
  trailer_type: z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker']).optional().nullable(),
  trailer_capacity_kg: z.coerce.number().int().positive().optional().nullable(),
  icces_device_id: z.string().trim().optional().nullable(),
  status: z.enum(['Available', 'OnTrip', 'Maintenance', 'Inactive']).optional(),
  image_url: z.string().nullable().optional(),
});

/* ─── Users (Admin-only web dashboard accounts) ─────────────────────────────
 * Only Admin/Operator are creatable here — Driver accounts are managed
 * through the Drivers module, never through User Management. See
 * CLAUDE.md "Roles" and "Who uses which app".
 */
const webUserRole = z.enum(['SuperAdmin', 'Admin', 'Operator']);

export const createUserBody = z.object({
  name: nonEmpty('Name'),
  username: z.string().trim().optional(),
  phone: z.string().trim().min(1, 'Phone number is required'),
  email: z.preprocess((val) => (val === '' ? null : val), z.string().trim().email('Invalid email address').nullable().optional()),
  role: webUserRole,
  password: nonEmpty('Password'),
  status: z.enum(['Active', 'Inactive']).optional(),
});

export const updateUserBody = z.object({
  name: nonEmpty('Name').optional(),
  username: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.preprocess((val) => (val === '' ? null : val), z.string().trim().email('Invalid email address').nullable().optional()),
  role: webUserRole.optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  password: nonEmpty('Password').optional(),
  // Platform flag, not part of role — controller enforces that only an
  // existing superadmin can change this field (see userController.updateUser).
  isSuperAdmin: z.boolean().optional(),
});

export const setDriverPasswordBody = z.object({
  password: z.string().trim().min(4, 'Password must be at least 4 characters'),
});


/* ─── Smart Report Builder ────────────────────────────────────────────────── */
export const reportQuerySpecBody = z.object({
  rootModule: z.string().trim().min(1, 'rootModule is required'),
  rows: z.array(z.string().trim()).default([]),
  columns: z.array(z.string().trim()).optional(),
  values: z.array(
    z.object({
      field: z.string().trim().min(1, 'value field is required'),
      agg: z.enum(['sum', 'avg', 'min', 'max', 'count']),
    })
  ).default([]),
  filters: z.array(
    z.object({
      field: z.string().trim().min(1, 'filter field is required'),
      op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'between']),
      value: z.unknown(),
    })
  ).optional(),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    field: z.string().optional(),
  }).optional(),
  limit: z.number().positive().optional(),
});

export const createSavedReportBody = z.object({
  name: z.string().trim().min(1, 'Report name is required'),
  category: z.string().trim().default('Custom'),
  spec: z.record(z.string(), z.unknown()),
  visualization: z.string().trim().default('table'),
  isTemplate: z.boolean().optional().default(false),
});

export const createScheduledReportBody = z.object({
  savedReportId: z.string().uuid('Valid savedReportId required'),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfMonth: z.number().int().optional(),
  time: z.string().trim().default('08:00'),
  recipients: z.array(z.string().trim()).default([]),
  delivery: z.array(z.string().trim()).default(['email']),
  isActive: z.boolean().optional().default(true),
});

export const updateScheduledReportBody = createScheduledReportBody.partial();

export const updateErrorEventBody = z.object({
  status: z.enum(['New', 'Acknowledged', 'Resolved']),
  notes: z.string().trim().max(2000).optional(),
});

export const clientErrorBody = z.object({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().trim().max(8000).optional(),
  route: z.string().trim().min(1).max(500),
});

const locationInputSchema = z.union([
  z.string().trim(),
  z.object({
    name: z.string().trim().optional(),
    location_name: z.string().trim().optional(),
    address: z.string().trim().optional(),
    location_address: z.string().trim().optional(),
    location_id: z.string().trim().nullable().optional(),
    locationId: z.string().trim().nullable().optional(),
    lat: z.coerce.number().optional().nullable(),
    lng: z.coerce.number().optional().nullable(),
    coordinate_precision: z.string().optional().nullable(),
    update_canonical_location: z.boolean().optional().nullable(),
  }),
]);

export const updateTripStopsRouteBody = z.object({
  origin: locationInputSchema.optional(),
  destination: locationInputSchema.optional(),
  intermediates: z.array(locationInputSchema).optional(),
  isRound: z.boolean().optional(),
  returnOrigin: locationInputSchema.optional(),
  returnDestination: locationInputSchema.optional(),
  returnIntermediates: z.array(locationInputSchema).optional(),
  stops: z.array(z.object({
    stop_sequence: z.number().int().optional(),
    leg_index: z.number().int().optional(),
    stop_type: z.string().optional(),
    name: z.string().trim().optional(),
    location_name: z.string().trim().optional(),
    address: z.string().trim().optional(),
    location_address: z.string().trim().optional(),
    location_id: z.string().trim().nullable().optional(),
    locationId: z.string().trim().nullable().optional(),
    lat: z.coerce.number().optional().nullable(),
    lng: z.coerce.number().optional().nullable(),
    coordinate_precision: z.string().optional().nullable(),
    update_canonical_location: z.boolean().optional().nullable(),
    planned_arrival: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).optional(),
  planned_start: z.string().optional().nullable(),
  planned_end: z.string().optional().nullable(),
});

