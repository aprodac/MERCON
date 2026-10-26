/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `npm run build` writes plain HTML/CSS to `out/`, which any
  // static host (Nginx, Vercel, Netlify, S3) can serve.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
