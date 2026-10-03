/** @type {import('tailwindcss').Config} */
// Theme lives in ../shared/tooling/tailwind-preset.js (shared by both apps).
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', '../shared/**/*.{js,jsx,ts,tsx}'],
  presets: [require('../shared/tooling/tailwind-preset')],
  // The operator app uses the web's brand charcoal instead of black.
  theme: { extend: { colors: { navbg: '#3E3C3D' } } },
};
