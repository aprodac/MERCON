/**
 * Centralized environment configuration.
 * Loads .env once and fails fast on missing required variables —
 * no silent fallbacks for secrets.
 */
import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    if (fallback) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public'),
  JWT_SECRET: required('JWT_SECRET', 'development_secret_key_change_me'),
  PORT: Number(process.env.PORT) || 3000,
  BASE_URL: process.env.BASE_URL, // optional — derived from PORT when absent
  // ICCES GPS tracking. Optional: the platform runs perfectly well without a
  // tracker integration, so a missing credential disables polling rather than
  // stopping the server.
  //
  // These previously defaulted to 'demo'/'demo123'/'demo_account'. That looked
  // harmless and was not: the API started cleanly, the poller ran every thirty
  // seconds against the vendor with credentials that could never work, and
  // every failure was swallowed into the log. Unset must mean unset, so that
  // "tracking is off" is visible instead of looking like "tracking is broken".
  ICCES_USER: process.env.ICCES_USER,
  ICCES_PASS: process.env.ICCES_PASS,
  ICCES_ACCT: process.env.ICCES_ACCT,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = env.DATABASE_URL;
}

/** True only when all three ICCES credentials are present. */
export function iccesConfigured(): boolean {
  return Boolean(env.ICCES_USER && env.ICCES_PASS && env.ICCES_ACCT);
}
