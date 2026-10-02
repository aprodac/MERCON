# Build from the repo root: docker build -f frontend/web-dashboard/Dockerfile .
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
# Workspace manifests first (for layer caching).
# NOTE: the lockfile is intentionally NOT copied. It is generated on macOS
# (darwin-arm64), and npm's optional-dependencies bug (npm/cli#4828) then
# skips the Linux rolldown native binding Vite 8 needs, breaking the build
# with "Cannot find module '@rolldown/binding-linux-x64-musl'". Installing
# without the lockfile lets npm resolve the correct binding for this platform.
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY frontend/web-dashboard/package.json ./frontend/web-dashboard/
# Strip root devDependencies (concurrently, localtunnel) and linter (oxlint) which are unnecessary for the Vite dashboard build
RUN node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('package.json')); delete r.devDependencies; fs.writeFileSync('package.json',JSON.stringify(r,null,2)); const d=JSON.parse(fs.readFileSync('frontend/web-dashboard/package.json')); if(d.devDependencies) delete d.devDependencies.oxlint; fs.writeFileSync('frontend/web-dashboard/package.json',JSON.stringify(d,null,2));" && \
    npm install --workspace=@mercon/shared-types --workspace=@mercon/web-dashboard --legacy-peer-deps --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache && \
    rm -rf /tmp/npm-cache /root/.npm /tmp/* && \
    npm cache clean --force


# Shared types (built explicitly since --ignore-scripts skips prepare)
COPY packages/shared-types ./packages/shared-types
RUN npm run build -w @mercon/shared-types
# Copy source code and build the Vite app
COPY frontend/web-dashboard ./frontend/web-dashboard

# Google address autocomplete key. Vite inlines VITE_* at build time, so this
# has to be present *here* — supplying it to the running container would be too
# late, the bundle is already written.
#
# Declared immediately before the build so the cached npm install and
# shared-types layers survive a key change, and deliberately NOT required: with
# no key the app falls back to Nominatim address search, so a local build or a
# fork without the secret still produces a working dashboard.
#
# This value ends up readable in the shipped JavaScript. That is inherent to
# any browser-side Google Maps key and is why the key is restricted by HTTP
# referrer to mercon.tech in the Google Cloud console — the referrer
# restriction is the control, not secrecy of the string.
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build -w @mercon/web-dashboard

# Production stage
FROM nginx:alpine
# Copy the custom nginx configuration
COPY frontend/web-dashboard/nginx.conf /etc/nginx/conf.d/default.conf
# Copy the built assets from the build stage
COPY --from=build /app/frontend/web-dashboard/dist /usr/share/nginx/html
# track.html: index.html plus the SSI include that nginx fills with a tracking
# link's WhatsApp preview tags (see the /t/ and /c/ locations in nginx.conf).
# Right after <meta charset> — the charset must stay first in <head>.
RUN sed 's|<meta charset="UTF-8" />|&<!--# include virtual="/__og$request_uri" -->|' \
      /usr/share/nginx/html/index.html > /usr/share/nginx/html/track.html \
 && grep -q '__og' /usr/share/nginx/html/track.html
# Expose port 80
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
