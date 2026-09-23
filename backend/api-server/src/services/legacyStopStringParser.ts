/**
 * Pure string parser: turns a CSV/bulk-import row's legacy `origin`/
 * `destination` text fields (e.g. destination "Medina [RETURN: Medina →
 * Riyadh]") into a TripStop-shaped array. Split out of tripController.ts so
 * it can be unit tested directly without pulling in Express/Prisma/route
 * wiring (importing tripController.ts itself in a test crashes on module
 * load order — it's wired for the app bootstrap, not standalone import).
 *
 * Only ever the fallback for rows with NO structured `stops[]` array. The
 * trip wizard always sends structured stops — see bulkImportTrips in
 * tripController.ts, and bulkImportStopResolution.test.ts for the
 * regression this split guards (TRP-0252: this function's own output used
 * to get spliced onto an already-correct structured stops array).
 */
export function parseFullTripStops(originStr: string, destinationStr: string) {
  const stopsList: Array<{
    stop_sequence: number;
    leg_index: number;
    stop_type: 'Pickup' | 'Dropoff';
    location_name: string;
    location_id?: string | null;
    lat?: number | null;
    lng?: number | null;
  }> = [];
  let seq = 1;

  const originClean = originStr.trim();
  if (originClean) {
    stopsList.push({ stop_sequence: seq++, leg_index: 0, stop_type: 'Pickup', location_name: originClean });
  }

  let outboundStr = destinationStr.trim();
  let returnStr = '';

  if (destinationStr.includes('[RETURN:')) {
    const parts = destinationStr.split(/\[RETURN:\s*/i);
    outboundStr = parts[0].trim();
    returnStr = parts[1].replace(']', '').trim();
  }

  const splitChain = (str: string) => {
    if (!str) return [];
    let s = str.trim().replace(/^(SHIPA|IMILE|JDL|AKS|GFS|RTL|HORIZON|ARKAN)\s+/i, '').trim();
    let norm = s.replace(/→|->|-->/g, ' + ').replace(/\//g, ' + ').replace(/&/g, ' + ');
    const chunks = norm.split('+').map(c => c.trim()).filter(Boolean);
    const items: string[] = [];
    const KNOWN_CODES = ['RUH','JED','DMM','BUR','UNZ','HAI','HAIL','KHA','ABH','TAI','TAIF','MAK','MAD','HOF','QUR','TAB','TABUK','ALB','JIZ','NAJ','WAD','TUB','SUD','DAM','AHSAR','AHSAN'];
    for (const chunk of chunks) {
      if (/\s+-\s+/.test(chunk) || /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+/i.test(chunk)) {
        items.push(...chunk.split('-').map(sp => sp.trim()).filter(Boolean));
      } else {
        const words = chunk.split(/\s+/).map(w => w.trim()).filter(Boolean);
        if (words.length >= 2 && words.every(w => KNOWN_CODES.includes(w.toUpperCase()) || w.length <= 6)) {
          items.push(...words);
        } else {
          items.push(chunk);
        }
      }
    }
    return items;
  };

  const outboundItems = splitChain(outboundStr);
  outboundItems.forEach((item) => {
    stopsList.push({ stop_sequence: seq++, leg_index: 0, stop_type: 'Dropoff', location_name: item });
  });

  if (returnStr) {
    const returnItems = splitChain(returnStr);
    if (returnItems.length === 1) {
      const lastOutboundLoc = stopsList[stopsList.length - 1]?.location_name || returnItems[0];
      stopsList.push({ stop_sequence: seq++, leg_index: 1, stop_type: 'Pickup', location_name: lastOutboundLoc });
      stopsList.push({ stop_sequence: seq++, leg_index: 1, stop_type: 'Dropoff', location_name: returnItems[0] });
    } else if (returnItems.length > 1) {
      stopsList.push({ stop_sequence: seq++, leg_index: 1, stop_type: 'Pickup', location_name: returnItems[0] });
      returnItems.slice(1).forEach((item) => {
        stopsList.push({ stop_sequence: seq++, leg_index: 1, stop_type: 'Dropoff', location_name: item });
      });
    }
  }

  return stopsList;
}
