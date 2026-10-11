/**
 * MapLibre for every map in the app. It's native code: a build made before it
 * was added doesn't have it, and the library's getEnforcing() throws at import
 * time when the native side is missing — so check first and only then load it.
 * `ML` is null on such builds; each map shows its own fallback instead.
 */
import { TurboModuleRegistry } from 'react-native';
import { quietOfflineTileErrors } from './mapLogs';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;
quietOfflineTileErrors(ML);
