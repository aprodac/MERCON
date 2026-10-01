/**
 * Map tiles that fail because the phone is offline aren't app errors — the map
 * fills in again when the connection is back. MapLibre logs them with
 * console.error (a red error screen in development); log them as a warning.
 * onLog replaces any earlier handler, so calling this from several maps is fine.
 */
type MapLibre = typeof import('@maplibre/maplibre-react-native');

export function quietOfflineTileErrors(ML: MapLibre | null) {
  ML?.LogManager.onLog(({ level, message }) => {
    if (level === 'error' && /Failed to load tile|appears to be offline|network connection was lost/i.test(message)) {
      console.warn(`Map tiles unavailable (offline?): ${message.split('[message]:').pop()}`);
      return true;
    }
    return false;
  });
}
