/**
 * Short, human device label from a browser user agent — "iPhone · Safari",
 * "Android · Chrome", "Windows · Edge". Used on tracking-link opens so ops can
 * tell opens apart. Nothing identifying is kept (no IP, no full user agent).
 */
export function deviceLabel(userAgent: string | string[] | undefined | null): string | null {
  const ua = Array.isArray(userAgent) ? userAgent[0] : userAgent;
  if (!ua) return null;

  const os =
    /iPhone/i.test(ua) ? 'iPhone'
      : /iPad/i.test(ua) ? 'iPad'
        : /Android/i.test(ua) ? 'Android'
          : /Windows/i.test(ua) ? 'Windows'
            : /Macintosh|Mac OS X/i.test(ua) ? 'Mac'
              : /CrOS/i.test(ua) ? 'Chromebook'
                : /Linux/i.test(ua) ? 'Linux'
                  : null;

  const app =
    /WhatsApp/i.test(ua) ? 'WhatsApp'
      : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook'
        : /Instagram/i.test(ua) ? 'Instagram'
          : /Edg\//i.test(ua) ? 'Edge'
            : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
              : /OPR\/|Opera/i.test(ua) ? 'Opera'
                : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
                  : /CriOS|Chrome/i.test(ua) ? 'Chrome'
                    : /Safari/i.test(ua) ? 'Safari'
                      : null;

  const label = [os, app].filter(Boolean).join(' · ');
  return label || null;
}
