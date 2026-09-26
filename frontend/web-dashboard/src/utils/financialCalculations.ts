/**
 * MERCON Single Source of Truth — Financial Calculation Engine
 * 
 * Unifies Customer Billing, Driver Payout, 3PL Subcontract Cost,
 * Operational N-Days Scheduling, Multi-Driver Rotations, Balance Margin,
 * and Per-Trip Billing Rate resolution across all frontend components.
 */

export interface DriverRotationPayoutInput {
  driverId?: string;
  driverName?: string;
  payout: number | string | null;
}

export interface TripFinancialInputs {
  customerBilling?: number | string | null;
  billingAmount?: number | string | null;
  baseRate?: number | string | null;
  monthlyRate?: number | string | null;

  driverPayout?: number | string | null;
  coDriverPayout?: number | string | null;
  quotationDriverPayout?: number | string | null;
  driverCharge?: number | string | null;
  driverPayoutsList?: DriverRotationPayoutInput[] | null;

  is3PL?: boolean;
  subcontractCost?: number | string | null;
  extraDriverPayment?: number | string | null;

  additionalCharges?: number | string | null;
  pricingBasis?: 'Per Trip' | 'Per Month' | 'PER_TRIP' | 'PER_MONTH' | string | null;
  billingType?: string | null;

  selectedOperatingDays?: number | null; // N days selected in schedule
}

export interface ComputedTripFinancials {
  isMonthly: boolean;
  monthlyRate: number;            // Full contract rate (SAR/mo)
  dailyRate: number;              // Daily breakdown rate: monthlyRate / 30 (SAR/day)
  perTripBreakdown: number;       // Equivalent daily/per-trip rate (SAR)
  resolvedBilling: number;        // Per-trip or schedule customer billing rate (SAR)
  resolvedDriverPayout: number;   // Driver payout or 3PL carrier cost (SAR) — NEVER divided by 30
  primaryDriverPayout: number;    // Primary driver per-trip payout rate (SAR)
  coDriverPayout: number;         // Co-driver per-trip payout rate (SAR)
  perDriverPayout: number;        // Single driver per-trip payout rate (SAR)
  driverCount: number;            // Number of assigned rotation drivers
  additionalChargesTotal: number; // Itemized extra charges sum (SAR)
  totalCustomerBilling: number;   // Resolved billing + additional charges (SAR)
  balanceMargin: number;          // Total customer billing - driver payout (SAR)
  marginPercent: number;          // Gross margin percentage (%) rounded to 1 decimal
  operatingDays: number;          // Operating schedule days count
  formattedLabels: {
    monthlyLabel: string;         // e.g. "SAR 30,000/mo"
    dailyLabel: string;           // e.g. "SAR 1,000/day"
    driverPayoutLabel: string;    // e.g. "SAR 200/trip" or "SAR 400 (2 Drivers)"
    scheduleBillingLabel: string; // e.g. "SAR 15,000 (15 days @ SAR 1,000/day)"
  };
}

function parseMoney(val: number | string | null | undefined): number {
  if (val == null) return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
  return isNaN(num) ? 0 : num;
}

export function computeTripFinancials(inputs: TripFinancialInputs): ComputedTripFinancials {
  // 1. Detect Pricing Basis (Per Month vs Per Trip)
  const pb = String(inputs.pricingBasis || '').trim().toUpperCase();
  const bt = String(inputs.billingType || '').trim().toLowerCase();
  const isMonthly = pb === 'PER_MONTH' || pb === 'PER MONTH' || bt.includes('monthly');

  // 2. Resolve Customer Billing Rates
  const rawBillingInput = parseMoney(inputs.customerBilling ?? inputs.billingAmount ?? inputs.baseRate ?? 0);
  const explicitMonthlyRate = inputs.monthlyRate ? parseMoney(inputs.monthlyRate) : 0;

  let monthlyRate = 0;
  let dailyRate = Math.max(0, rawBillingInput);
  let resolvedBilling = Math.max(0, rawBillingInput);

  const operatingDays = inputs.selectedOperatingDays != null && inputs.selectedOperatingDays > 0
    ? inputs.selectedOperatingDays
    : 1;

  if (isMonthly) {
    if (explicitMonthlyRate > 0) {
      monthlyRate = explicitMonthlyRate;
      dailyRate = Number((monthlyRate / 30).toFixed(2));
    } else if (rawBillingInput > 3000) {
      monthlyRate = rawBillingInput;
      dailyRate = Number((monthlyRate / 30).toFixed(2));
    } else {
      dailyRate = rawBillingInput;
      monthlyRate = Number((dailyRate * 30).toFixed(2));
    }

    resolvedBilling = operatingDays > 1
      ? Number((dailyRate * operatingDays).toFixed(2))
      : dailyRate;
  }

  // 3. Resolve Driver Payout & Co-Driver Payout (NEVER DIVIDED BY 30)
  const extraDriver = parseMoney(inputs.extraDriverPayment ?? 0);
  const coDriverPayoutInput = parseMoney(inputs.coDriverPayout ?? 0);
  let perDriverPayout = 0;
  let primaryDriverPayout = 0;
  let coDriverPayout = coDriverPayoutInput;
  let totalDriverPayout = 0;
  let driverCount = 1;

  if (inputs.is3PL) {
    perDriverPayout = Math.max(0, parseMoney(inputs.subcontractCost ?? 0));
    primaryDriverPayout = perDriverPayout;
    totalDriverPayout = perDriverPayout * (inputs.selectedOperatingDays != null && inputs.selectedOperatingDays > 0 ? inputs.selectedOperatingDays : 1);
  } else if (inputs.driverPayoutsList && inputs.driverPayoutsList.length > 0) {
    driverCount = inputs.driverPayoutsList.length;
    perDriverPayout = inputs.driverPayoutsList.reduce((sum, d) => sum + parseMoney(d.payout), 0) / driverCount;
    primaryDriverPayout = perDriverPayout;
    const basePayoutSum = inputs.driverPayoutsList.reduce((sum, d) => sum + parseMoney(d.payout), 0);
    const scheduleDays = inputs.selectedOperatingDays != null && inputs.selectedOperatingDays > 0 ? inputs.selectedOperatingDays : 1;
    totalDriverPayout = basePayoutSum * scheduleDays;
  } else {
    const quotationDefaultPayout = parseMoney(inputs.quotationDriverPayout ?? 0);
    const rawPrimaryPayout = parseMoney(inputs.driverPayout ?? inputs.driverCharge ?? 0);

    let primaryVal = 0;
    let coVal = coDriverPayoutInput;

    if (coDriverPayoutInput > 0) {
      if (rawPrimaryPayout > 0) {
        if (rawPrimaryPayout === coDriverPayoutInput) {
          // Already split 50/50 (e.g. 30 and 30)
          primaryVal = rawPrimaryPayout;
        } else if (rawPrimaryPayout >= coDriverPayoutInput * 2) {
          // Combined total payout (e.g. 60 and 30) -> subtract co-driver's share
          primaryVal = rawPrimaryPayout - coDriverPayoutInput;
        } else {
          primaryVal = rawPrimaryPayout;
        }
      } else if (quotationDefaultPayout > 0) {
        if (quotationDefaultPayout > coDriverPayoutInput) {
          primaryVal = quotationDefaultPayout - coDriverPayoutInput;
        } else {
          primaryVal = quotationDefaultPayout;
        }
      } else {
        // Fallback: match primary driver payout to co-driver payout
        primaryVal = coDriverPayoutInput;
      }
    } else {
      primaryVal = rawPrimaryPayout > 0 ? rawPrimaryPayout : quotationDefaultPayout;
      coVal = 0;
    }

    primaryDriverPayout = Math.max(0, primaryVal);
    coDriverPayout = Math.max(0, coVal);
    perDriverPayout = primaryDriverPayout;
    const scheduleDays = inputs.selectedOperatingDays != null && inputs.selectedOperatingDays > 0 ? inputs.selectedOperatingDays : 1;
    totalDriverPayout = (primaryDriverPayout + coDriverPayout) * scheduleDays;
  }

  const resolvedDriverPayout = Math.max(0, totalDriverPayout + extraDriver);

  // 4. Resolve Additional Billable Charges
  const additionalChargesTotal = Math.max(0, parseMoney(inputs.additionalCharges ?? 0));

  // 5. Compute Total Customer Billing (Revenue)
  const totalCustomerBilling = resolvedBilling + additionalChargesTotal;

  // 6. Compute Balance Margin & Margin Percentage
  const balanceMargin = totalCustomerBilling - resolvedDriverPayout;
  const marginPercent = totalCustomerBilling > 0
    ? Number(((balanceMargin / totalCustomerBilling) * 100).toFixed(1))
    : 0;

  // 7. Formatted UI Labels
  const monthlyLabel = `SAR ${monthlyRate.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/mo`;
  const dailyLabel = `SAR ${dailyRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day`;
  const driverPayoutLabel = driverCount > 1
    ? `SAR ${resolvedDriverPayout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} (${driverCount} Drivers)`
    : `SAR ${perDriverPayout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/trip`;
  
  const scheduleBillingLabel = isMonthly && inputs.selectedOperatingDays && inputs.selectedOperatingDays > 1
    ? `SAR ${resolvedBilling.toLocaleString()} (${inputs.selectedOperatingDays} days @ ${dailyLabel})`
    : `SAR ${resolvedBilling.toLocaleString()}`;

  return {
    isMonthly,
    monthlyRate,
    dailyRate,
    perTripBreakdown: dailyRate,
    resolvedBilling,
    resolvedDriverPayout,
    primaryDriverPayout,
    coDriverPayout,
    perDriverPayout,
    driverCount,
    additionalChargesTotal,
    totalCustomerBilling,
    balanceMargin,
    marginPercent,
    operatingDays,
    formattedLabels: {
      monthlyLabel,
      dailyLabel,
      driverPayoutLabel,
      scheduleBillingLabel,
    },
  };
}
