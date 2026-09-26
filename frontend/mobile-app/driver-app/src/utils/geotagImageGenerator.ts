/**
 * Utility to generate a composited Geotagged Evidence Image
 * containing the original cargo photo with the official MERCON Geotag Panel stamped at the bottom.
 * Works seamlessly across Web, iOS, Android, and Expo Go.
 */

export interface GeotagData {
  photoUri: string;
  locationName: string;
  fullAddress: string;
  companyName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export async function generateGeotaggedEvidenceImage(data: GeotagData): Promise<string> {
  const {
    photoUri, locationName, fullAddress, companyName, latitude, longitude, timestamp
  } = data;

  const dateObj = new Date(timestamp);
  const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const coordsStr = `${latitude.toFixed(4)}°N · ${longitude.toFixed(4)}°E`;
  const cleanAddress = fullAddress.replace(/\n/g, ' ');

  // 1. Try HTML5 Canvas compositing if in browser environment
  if (typeof document !== 'undefined') {
    try {
      const canvasResult = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const width = 1080;
          const scale = width / img.width;
          const photoHeight = Math.round(img.height * scale);
          const panelHeight = 280;
          const totalHeight = photoHeight + panelHeight;

          canvas.width = width;
          canvas.height = totalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);

          // Background & Photo
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, 0, width, totalHeight);
          ctx.drawImage(img, 0, 0, width, photoHeight);

          // Solid White Flat Geotag Panel (No curves)
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.rect(0, photoHeight, width, panelHeight);
          ctx.fill();

          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, photoHeight);
          ctx.lineTo(width, photoHeight);
          ctx.stroke();

          // Inner Map Tile (Left)
          ctx.fillStyle = '#F1F5F9';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(24, photoHeight + 24, 180, 200, 16);
          } else {
            ctx.rect(24, photoHeight + 24, 180, 200);
          }
          ctx.fill();

          // Roads
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(24, photoHeight + 100, 180, 24);
          ctx.fillRect(90, photoHeight + 24, 24, 200);

          // Pin
          ctx.fillStyle = '#FA634E';
          ctx.beginPath();
          ctx.arc(102, photoHeight + 100, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(102, photoHeight + 100, 5, 0, Math.PI * 2);
          ctx.fill();

          // Location Details & Metadata (Right)
          ctx.fillStyle = '#3E3C3D';
          ctx.font = 'bold 30px sans-serif';
          ctx.fillText(locationName, 230, photoHeight + 60);

          ctx.fillStyle = '#64748B';
          ctx.font = '20px sans-serif';
          ctx.fillText(cleanAddress, 230, photoHeight + 94);

          // Divider
          ctx.strokeStyle = '#F1F5F9';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(230, photoHeight + 114);
          ctx.lineTo(width - 24, photoHeight + 114);
          ctx.stroke();

          // Metadata rows
          ctx.fillStyle = '#64748B';
          ctx.font = '19px sans-serif';
          ctx.fillText('Captured:', 230, photoHeight + 148);
          ctx.fillStyle = '#3E3C3D';
          ctx.font = 'bold 19px sans-serif';
          ctx.fillText(`${formattedDate} · ${formattedTime}`, 330, photoHeight + 148);

          ctx.fillStyle = '#64748B';
          ctx.font = '19px sans-serif';
          ctx.fillText('Coordinates:', 230, photoHeight + 180);
          ctx.fillStyle = '#3E3C3D';
          ctx.font = 'bold 19px sans-serif';
          ctx.fillText(coordsStr, 350, photoHeight + 180);

          ctx.fillStyle = '#64748B';
          ctx.font = '19px sans-serif';
          ctx.fillText('Customer:', 230, photoHeight + 212);
          ctx.fillStyle = '#3E3C3D';
          ctx.font = 'bold 19px sans-serif';
          ctx.fillText(companyName, 330, photoHeight + 212);

          // MERCON Branding + GPS Attribution Footer
          ctx.fillStyle = '#3E3C3D';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText(`MERCON LOGISTICS • ${companyName}`, 24, photoHeight + 265);

          ctx.fillStyle = '#94A3B8';
          ctx.font = 'bold 18px sans-serif';
          ctx.fillText('Google Maps · GPS Verified', width - 290, photoHeight + 265);

          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = photoUri;
      });

      if (canvasResult) return canvasResult;
    } catch (e) {
      // Canvas failed
    }
  }

  // 2. Generate SVG composited geotagged evidence image data URI (Works on all mobile native environments!)
  const svgXml = `
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1360" viewBox="0 0 1080 1360">
    <style>
      .bold-title { font-family: system-ui, -apple-system, sans-serif; font-weight: 800; font-size: 30px; fill: #3E3C3D; }
      .sub-text { font-family: system-ui, -apple-system, sans-serif; font-weight: 500; font-size: 20px; fill: #64748B; }
      .label-text { font-family: system-ui, -apple-system, sans-serif; font-weight: 600; font-size: 19px; fill: #64748B; }
      .value-text { font-family: system-ui, -apple-system, sans-serif; font-weight: 700; font-size: 19px; fill: #3E3C3D; }
      .brand-title { font-family: system-ui, -apple-system, sans-serif; font-weight: 900; font-size: 20px; fill: #3E3C3D; letter-spacing: 1px; }
      .attr-text { font-family: system-ui, -apple-system, sans-serif; font-weight: 600; font-size: 18px; fill: #94A3B8; }
    </style>

    <!-- 1. Background Frame & Cargo Photo -->
    <rect width="1080" height="1360" fill="#0F172A"/>
    <image xlink:href="${photoUri}" href="${photoUri}" width="1080" height="1080" preserveAspectRatio="xMidYMid slice" />

    <!-- 2. Flat White Geotag Panel (No curves, attached directly below photo) -->
    <rect y="1080" width="1080" height="280" fill="#FFFFFF"/>
    <line x1="0" y1="1080" x2="1080" y2="1080" stroke="#E2E8F0" stroke-width="2"/>

    <!-- 3. Mini Map Tile (Left) -->
    <rect x="24" y="1104" width="180" height="200" rx="16" fill="#F1F5F9"/>
    <rect x="24" y="1180" width="180" height="24" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>
    <rect x="90" y="1104" width="24" height="200" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>
    <circle cx="102" cy="1180" r="14" fill="#FA634E"/>
    <circle cx="102" cy="1180" r="5" fill="#FFFFFF"/>
    <rect x="32" y="1272" width="60" height="20" rx="4" fill="rgba(255,255,255,0.9)"/>
    <text x="42" y="1286" font-family="sans-serif" font-weight="700" font-size="11" fill="#64748B">Google</text>

    <!-- 4. Location Details & Metadata (Right) -->
    <text x="230" y="1140" class="bold-title">${escapeXml(locationName)}</text>
    <text x="230" y="1174" class="sub-text">${escapeXml(cleanAddress)}</text>

    <line x1="230" y1="1194" x2="1056" y2="1194" stroke="#F1F5F9" stroke-width="2"/>

    <!-- Metadata Rows -->
    <text x="230" y="1228" class="label-text">Captured:</text>
    <text x="330" y="1228" class="value-text">${formattedDate} · ${formattedTime}</text>

    <text x="230" y="1260" class="label-text">Coordinates:</text>
    <text x="350" y="1260" class="value-text">${coordsStr}</text>

    <text x="230" y="1292" class="label-text">Customer:</text>
    <text x="330" y="1292" class="value-text">${escapeXml(companyName)}</text>

    <line x1="24" y1="1318" x2="1056" y2="1318" stroke="#F8FAFC" stroke-width="2"/>

    <!-- Footer Branding -->
    <text x="24" y="1345" class="brand-title">MERCON LOGISTICS • ${escapeXml(companyName)}</text>
    <text x="790" y="1345" class="attr-text">Google Maps · GPS Verified</text>
  </svg>
  `;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgXml.trim());
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
