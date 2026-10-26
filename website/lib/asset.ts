// The site can be served from a sub-path (e.g. mercon.tech/linaul). Next adds
// basePath to links and its own bundles, but not to plain <img> sources.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const asset = (path: string) => `${basePath}${path}`;
