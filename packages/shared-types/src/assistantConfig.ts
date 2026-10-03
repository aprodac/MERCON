/**
 * Team-wide settings for the floating assistant (Settings → Assistant): what
 * it reports and how it looks. Stored as `Settings.assistantConfig` (JSON);
 * anything missing or invalid falls back to the defaults below, so older
 * rows and partial updates are always safe to read.
 */

export const CHARGE_REVIEW_LOOKBACK_DAYS = [7, 14, 30] as const;
export type ChargeReviewLookbackDays = (typeof CHARGE_REVIEW_LOOKBACK_DAYS)[number];

export interface AssistantConfig {
  reports: {
    /** After a trip is completed: "any extra charges for the customer?" */
    extraCharges: {
      enabled: boolean;
      /** Only trips finished within this many days are asked about. */
      lookbackDays: ChargeReviewLookbackDays;
      /** Hop and show a one-line note when a trip just finished. */
      peekOnNewTrip: boolean;
      /** Trips waiting this many days make it restless (and get a "waiting" tag). */
      restlessAfterDays: number;
    };
  };
  /** Crew details on the character. */
  look: { cap: boolean; flag: boolean; headset: boolean };
}

export const DEFAULT_ASSISTANT_CONFIG: AssistantConfig = {
  reports: { extraCharges: { enabled: true, lookbackDays: 30, peekOnNewTrip: true, restlessAfterDays: 3 } },
  look: { cap: true, flag: true, headset: true },
};

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function normalizeAssistantConfig(raw: unknown): AssistantConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  const ec = r.reports?.extraCharges ?? {};
  const d = DEFAULT_ASSISTANT_CONFIG;
  const lookback = CHARGE_REVIEW_LOOKBACK_DAYS.includes(ec.lookbackDays) ? ec.lookbackDays : d.reports.extraCharges.lookbackDays;
  const restless = Number.isInteger(ec.restlessAfterDays) && ec.restlessAfterDays >= 1 && ec.restlessAfterDays <= 30
    ? ec.restlessAfterDays
    : d.reports.extraCharges.restlessAfterDays;
  return {
    reports: {
      extraCharges: {
        enabled: bool(ec.enabled, d.reports.extraCharges.enabled),
        lookbackDays: lookback,
        peekOnNewTrip: bool(ec.peekOnNewTrip, d.reports.extraCharges.peekOnNewTrip),
        restlessAfterDays: restless,
      },
    },
    look: {
      cap: bool(r.look?.cap, d.look.cap),
      flag: bool(r.look?.flag, d.look.flag),
      headset: bool(r.look?.headset, d.look.headset),
    },
  };
}
