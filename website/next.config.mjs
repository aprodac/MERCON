// BASE_PATH lets the same build live at a sub-path, e.g. BASE_PATH=/linaul
// for mercon.tech/linaul. Empty (default) serves it from the domain root.
const basePath = process.env.BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `npm run build` writes plain HTML/CSS to `out/`, which any
  // static host (Nginx, Vercel, Netlify, S3) can serve.
  output: 'export',
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
};

export default nextConfig;
