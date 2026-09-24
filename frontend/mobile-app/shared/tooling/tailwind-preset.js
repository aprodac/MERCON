/**
 * Tailwind/NativeWind theme shared by both mobile apps (used as a preset by
 * each app's tailwind.config.js, which only sets `content`).
 *
 * @type {import('tailwindcss').Config}
 */
// Runs in Node at build time (Metro/NativeWind), so unlike shared/theme/tokens.ts
// it can't read expo-constants — but it can read process.env directly, same
// as the apps' app.config.ts. Keep this brand color in sync with CLIENT_PROFILES there.
const BRAND_COLORS = {
  mercon: { DEFAULT: '#E8450F', light: '#FFF0EB', dark: '#C7380A' },
};
const brand = BRAND_COLORS[process.env.APP_CLIENT] || BRAND_COLORS.mercon;

module.exports = {
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Mirrors shared/theme/tokens.ts `Colors` — keep the two in sync.
      colors: {
        primary: brand,
        navbg: '#000000',
        success: { DEFAULT: '#16A34A', light: '#F0FDF4' },
        warning: { DEFAULT: '#D97706', light: '#FFFBEB' },
        danger: { DEFAULT: '#DC2626', light: '#FEF2F2' },
        info: { DEFAULT: '#2563EB', light: '#EFF6FF' },
      },
    },
  },
  plugins: [],
};
