/**
 * MERCON Single Source of Truth — Backend Financial Calculation Engine
 *
 * Handles Customer Billing, Driver Payout, 3PL Subcontract Cost,
 * Operational N-Days Scheduling, Balance Margin (Profit), and Margin Percentage.
 */

import { TripStatus } from '@prisma/client';
import { parseOptionalFloat } from './uuid';

type Money = number | string | null | undefined | { toNumber(): number };

export const asNumber = (v: Money): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  const num = parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
  return isNaN(num) ? 0 : num;
};

export interface ChargeLike {
  amount: Money;
}

export interface BackendTripFinancialInputs {
  billing_amount?: Money;
  applied_rate?: Money;
  rateCard?: { base_price?: Money; driver_payout?: Money };
  quotation?: { rate?: Money; driver_payout?: Money; pricing_basis?: string };

  driver_payout?: Money;
  co_driver_payout?: Money;
  driver_charge?: Money;
  trip_charges?: Money;
  extra_driver_payment?: Money;

  is_third_party?: boolean;
  third_party_cost?: Money;
  subcontract?: { cost?: Money };

  charges?: ChargeLike[] | null;
  charges_total?: Money;

  paid_amount?: Money;
  pricing_basis?: string;
  billing_type?: string;
  selected_operating_days?: Money;
}

export interface ComputedBackendFinancials {
  isMonthly: boolean;
  monthlyRate: number;            // Full contract rate (SAR/mo)
  dailyRate: number;              // Daily breakdown rate: monthlyRate / 30 (SAR/day)
  perTripBilling: number;        // Base customer rate for active trip
  chargesTotal: number;          // Additional billable charges
  totalCustomerBilling: number;  // perTripBilling + chargesTotal
  primaryDriverPayout: number;   // Primary driver payout (SAR)
  coDriverPayout: number;        // Co-driver payout (SAR)
  totalDriverPayout: number;     // Sum of primary + co-driver + 3PL cost
  extraDriverPayment: number;    // Extra driver allowance
  balanceMargin: number;         // totalCustomerBilling - totalDriverPayout
  marginPercent: number;         // Margin percentage (%)
  paidAmount: number;            // Amount already paid
  balanceDue: number;            // totalCustomerBilling - paidAmount
}

/** Sum of itemised customer-billable extras on a trip. */
export function computeTripChargesTotal(charges: ChargeLike[] | null | undefined): number {
  if (!charges || charges.length === 0) return 0;
  return charges.reduce((sum, c) => sum + asNumber(c.amount), 0);
}

export interface ResolveDriverPayoutInput {
  /** trip.driver_payout ?? trip.driver_charge — the payout already on the trip. */
  currentDriverPayout: Money;
  isThirdParty: boolean;
  /** trip.subcontract?.cost ?? trip.third_party_cost */
  subcontractCost: Money;
  /**
   * The raw (unparsed) value of req.body.driver_payout, falling back to
   * driver_charge then trip_charges — `undefined` only when none of the
   * three keys were sent, which is what distinguishes "caller didn't touch
   * this field" from "caller explicitly sent a value" (including a value
   * that turns out not to parse, which still overrides rather than falling
   * through to the subcontract-cost guess below).
   */
  requestedPayoutRaw: unknown;
}

/**
 * MERCON's own driver pulls the lane's agreed payout off the rate card; a
 * third-party job pulls the subcontractor cost already on the trip. Either
 * way it stays a suggestion, not a lock — an explicit value in the request
 * always wins, and the settlement form can still override it before
 * submitting.
 */
export function resolveDriverPayout(input: ResolveDriverPayoutInput): number {
  const { currentDriverPayout, isThirdParty, subcontractCost, requestedPayoutRaw } = input;

  if (requestedPayoutRaw !== undefined) {
    return parseOptionalFloat(requestedPayoutRaw) ?? 0;
  }
  if (isThirdParty && subcontractCost !== null && subcontractCost !== undefined) {
    return asNumber(subcontractCost);
  }
  return asNumber(currentDriverPayout);
}

/**
 * Past-time trips can never be created as Scheduled/Draft: if the planned
 * start has already passed, the initial status must be Delayed regardless of
 * what was requested, since "Scheduled for the past" is a contradiction the
 * rest of the app isn't built to handle.
 *
 * `initialStatus` is whatever the caller already resolved the status to
 * (callers differ here — e.g. bulk-import validates the raw value against
 * the TripStatus enum first, a single create doesn't — so that step stays
 * with each caller). `requestedStatusRaw` is the original, unvalidated value
 * the caller received, which is what the override condition itself checks
 * against, matching both callers' existing behavior exactly.
 */
export function resolveInitialTripStatus(
  initialStatus: TripStatus,
  requestedStatusRaw: TripStatus | string | null | undefined,
  plannedStart: Date | null
): TripStatus {
  if (plannedStart) {
    const diffMs = Date.now() - plannedStart.getTime();
    if (diffMs >= 0) {
      if (
        !requestedStatusRaw ||
        requestedStatusRaw === TripStatus.Scheduled ||
        requestedStatusRaw === TripStatus.Draft ||
        (requestedStatusRaw as string) === 'Scheduled'
      ) {
        return TripStatus.Delayed;
      }
    }
  }

  return initialStatus;
}

export interface CoDriverPayoutSplitInput {
  totalPayout: number;
  /** Truthy when a co-driver is assigned (co_driver_id on the trip/row). */
  hasCoDriver: boolean;
  /**
   * The raw (unparsed) co_driver_payout value — `undefined`/`null` is what
   * distinguishes "caller didn't send a co-driver payout" (split evenly)
   * from "caller explicitly set one" (use it as-is, don't touch the split).
   */
  explicitCoDriverPayout: unknown;
}

export interface CoDriverPayoutSplit {
  driverPayout: number;
  coDriverPayout: number;
}

/**
 * When a co-driver is assigned and the caller didn't send an explicit
 * co-driver payout, the total payout is split evenly between the two
 * drivers rather than the primary driver keeping all of it.
 */
export function splitCoDriverPayout(input: CoDriverPayoutSplitInput): CoDriverPayoutSplit {
  const { totalPayout, hasCoDriver, explicitCoDriverPayout } = input;

  let driverPayout = totalPayout;
  let coDriverPayout = explicitCoDriverPayout !== undefined && explicitCoDriverPayout !== null
    ? asNumber(explicitCoDriverPayout as Money)
    : 0;

  if (hasCoDriver && (explicitCoDriverPayout === undefined || explicitCoDriverPayout === null) && totalPayout > 0) {
    driverPayout = Math.round((totalPayout / 2) * 100) / 100;
    coDriverPayout = Math.round((totalPayout / 2) * 100) / 100;
  }

  return { driverPayout, coDriverPayout };
}

/** Base billing price for the customer. */
export function computeTripBaseBilling(trip: BackendTripFinancialInputs): number {
  const billing = trip.billing_amount ?? trip.applied_rate ?? trip.rateCard?.base_price ?? trip.quotation?.rate;
  return Math.max(0, asNumber(billing));
}

/** Full amount owed by customer: base price plus itemised extras. */
export function computeTripTotalAmount(
  trip: BackendTripFinancialInputs,
  charges?: ChargeLike[] | null
): number {
  const base = computeTripBaseBilling(trip);
  const extra = charges !== undefined ? computeTripChargesTotal(charges) : asNumber(trip.charges_total ?? computeTripChargesTotal(trip.charges));
  return base + extra;
}

/** Driver Payout or 3PL Subcontract Cost. NEVER DIVIDED BY 30. */
export function computeTripDriverPayout(trip: BackendTripFinancialInputs): number {
  const fin = calculateBackendTripFinancials(trip);
  return fin.totalDriverPayout;
}

/** Balance profit kept by MERCON: customer total minus driver payout. */
export function computeTripBalance(
  trip: BackendTripFinancialInputs,
  charges?: ChargeLike[] | null
): number {
  const totalAmt = computeTripTotalAmount(trip, charges);
  const driverCost = computeTripDriverPayout(trip);
  return totalAmt - driverCost;
}

/** Comprehensive financial calculation for trip controllers and reports. */
export function calculateBackendTripFinancials(trip: BackendTripFinancialInputs): ComputedBackendFinancials {
  const pb = String(trip.pricing_basis || trip.quotation?.pricing_basis || '').toUpperCase();
  const bt = String(trip.billing_type || '').toLowerCase();
  const isMonthly = pb === 'PER_MONTH' || pb === 'PER MONTH' || bt.includes('monthly');

  const rawBaseBilling = computeTripBaseBilling(trip);
  const quotationRate = trip.quotation?.rate ? asNumber(trip.quotation.rate) : 0;

  let monthlyRate = 0;
  let dailyRate = rawBaseBilling;
  let perTripBilling = rawBaseBilling;

  const days = asNumber(trip.selected_operating_days);
  const operatingDays = days > 0 ? days : 1;

  if (isMonthly) {
    if (quotationRate > 0) {
      monthlyRate = quotationRate;
      dailyRate = Number((monthlyRate / 30).toFixed(2));
    } else if (rawBaseBilling > 3000) {
      monthlyRate = rawBaseBilling;
      dailyRate = Number((monthlyRate / 30).toFixed(2));
    } else {
      dailyRate = rawBaseBilling;
      monthlyRate = Number((dailyRate * 30).toFixed(2));
    }

    perTripBilling = days > 1 ? Number((dailyRate * days).toFixed(2)) : dailyRate;
  }

  const chargesTotal = trip.charges_total !== undefined && trip.charges_total !== null
    ? asNumber(trip.charges_total)
    : computeTripChargesTotal(trip.charges);
  
  const totalCustomerBilling = perTripBilling + chargesTotal;
  const extraDriverPayment = asNumber(trip.extra_driver_payment);

  let primaryDriverPayout = 0;
  let coDriverPayout = 0;
  let totalDriverPayout = 0;

  if (trip.is_third_party) {
    const cost = trip.subcontract?.cost ?? trip.third_party_cost;
    primaryDriverPayout = Math.max(0, asNumber(cost));
    totalDriverPayout = Math.max(0, (primaryDriverPayout * operatingDays) + extraDriverPayment);
  } else {
    const quotationDefault = trip.rateCard?.driver_payout ?? trip.quotation?.driver_payout;
    const quotationDefaultVal = quotationDefault != null ? asNumber(quotationDefault) : 0;
    const rawPrimary = trip.driver_payout ?? trip.driver_charge ?? trip.trip_charges ?? 0;
    const rawPrimaryVal = asNumber(rawPrimary);
    let coVal = asNumber(trip.co_driver_payout);

    const hasCoDriver = Boolean((trip as any).co_driver_id || (trip as any).coDriverId || (trip as any).coDriver || coVal > 0);

    let primaryVal = 0;

    if (hasCoDriver) {
      if (coVal > 0) {
        if (rawPrimaryVal > 0) {
          if (rawPrimaryVal === coVal) {
            primaryVal = rawPrimaryVal;
          } else if (rawPrimaryVal >= coVal * 2) {
            primaryVal = rawPrimaryVal - coVal;
          } else {
            primaryVal = rawPrimaryVal;
          }
        } else if (quotationDefaultVal > 0) {
          if (quotationDefaultVal > coVal) {
            primaryVal = quotationDefaultVal - coVal;
          } else {
            primaryVal = quotationDefaultVal;
          }
        } else {
          primaryVal = coVal;
        }
      } else if (rawPrimaryVal > 0) {
        // Equal 50/50 split of the total saved rate driver payout
        const half = Math.round((rawPrimaryVal / 2) * 100) / 100;
        primaryVal = half;
        coVal = half;
      } else if (quotationDefaultVal > 0) {
        const half = Math.round((quotationDefaultVal / 2) * 100) / 100;
        primaryVal = half;
        coVal = half;
      }
    } else {
      primaryVal = rawPrimaryVal > 0 ? rawPrimaryVal : quotationDefaultVal;
      coVal = 0;
    }

    primaryDriverPayout = Math.max(0, primaryVal);
    coDriverPayout = Math.max(0, coVal);
    totalDriverPayout = Math.max(0, ((primaryDriverPayout + coDriverPayout) * operatingDays) + extraDriverPayment);
  }

  const balanceMargin = totalCustomerBilling - totalDriverPayout;
  const marginPercent = totalCustomerBilling > 0
    ? Number(((balanceMargin / totalCustomerBilling) * 100).toFixed(1))
    : 0;

  const paidAmount = asNumber(trip.paid_amount);
  const balanceDue = totalCustomerBilling - paidAmount;

  return {
    isMonthly,
    monthlyRate,
    dailyRate,
    perTripBilling,
    chargesTotal,
    totalCustomerBilling,
    primaryDriverPayout,
    coDriverPayout,
    totalDriverPayout,
    extraDriverPayment,
    balanceMargin,
    marginPercent,
    paidAmount,
    balanceDue,
  };
}
