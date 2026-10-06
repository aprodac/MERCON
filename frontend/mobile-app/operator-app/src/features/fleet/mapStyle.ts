/**
 * The Fleet map's basemap colours — the same Apple Maps / CarPlay palette as
 * the web live map (web-dashboard components/maps/live/liveMapStyle.ts): warm
 * paper land, green parks, clear blue water, yellow-orange highways in light;
 * deep navy with muted green and blue in dark. Keep the two in step.
 *
 * The OpenFreeMap style is fetched once per theme and handed to the map with
 * the palette already baked in, so the stock colours never flash. When the
 * fetch fails the map falls back to the plain style URL.
 */
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
export type MapTheme = keyof typeof MAP_STYLES;

/** Land colour behind the map while its style loads. */
export const MAP_BG: Record<MapTheme, string> = { light: '#f6f4ef', dark: '#1a2230' };

type Paint = Record<string, string | number>;

/** Paint overrides, keyed by the base style's layer ids. Layers a style doesn't have are skipped. */
const PALETTE: Record<MapTheme, Record<string, Paint>> = {
  light: {
    background: { 'background-color': '#f6f4ef' },
    landuse_residential: { 'fill-color': '#efece5', 'fill-opacity': 0.9 },
    park: { 'fill-color': '#c9e7b8', 'fill-opacity': 0.95 },
    park_outline: { 'line-color': '#b3dba0' },
    landcover_grass: { 'fill-color': '#d3ebc3', 'fill-opacity': 0.9 },
    landcover_wood: { 'fill-color': '#bfe0aa', 'fill-opacity': 0.9 },
    landcover_wetland: { 'fill-color': '#cfe6d2' },
    landcover_sand: { 'fill-color': '#f3e7c9', 'fill-opacity': 0.85 },
    landuse_pitch: { 'fill-color': '#bfe3b0' },
    landuse_cemetery: { 'fill-color': '#d6e8cc' },
    landuse_hospital: { 'fill-color': '#f9dede' },
    landuse_school: { 'fill-color': '#f4ead6' },
    water: { 'fill-color': '#a5d4f7' },
    waterway_river: { 'line-color': '#a5d4f7' },
    waterway_other: { 'line-color': '#a5d4f7' },
    aeroway_fill: { 'fill-color': '#e7e4ee' },
    building: { 'fill-color': '#e8e4dc', 'fill-outline-color': '#dcd6cb' },
    road_motorway: { 'line-color': '#f9c46b' },
    road_motorway_casing: { 'line-color': '#e0a340' },
    road_motorway_link: { 'line-color': '#f9c46b' },
    road_motorway_link_casing: { 'line-color': '#e0a340' },
    bridge_motorway: { 'line-color': '#f9c46b' },
    bridge_motorway_casing: { 'line-color': '#e0a340' },
    road_trunk_primary: { 'line-color': '#fde7a6' },
    road_trunk_primary_casing: { 'line-color': '#e9c878' },
    bridge_trunk_primary: { 'line-color': '#fde7a6' },
    bridge_trunk_primary_casing: { 'line-color': '#e9c878' },
    road_secondary_tertiary: { 'line-color': '#ffffff' },
    road_secondary_tertiary_casing: { 'line-color': '#ddd7cc' },
    road_minor: { 'line-color': '#ffffff' },
    road_minor_casing: { 'line-color': '#e2ddd3' },
  },
  dark: {
    background: { 'background-color': '#1a2230' },
    landuse_residential: { 'fill-color': '#1e2735', 'fill-opacity': 0.9 },
    landuse_park: { 'fill-color': '#1d3a2e', 'fill-opacity': 0.95 },
    landcover_wood: { 'fill-color': '#1b3529', 'fill-opacity': 0.9 },
    water: { 'fill-color': '#173a58' },
    waterway: { 'line-color': '#1d4466' },
    building: { 'fill-color': '#242e3d' },
    highway_minor: { 'line-color': '#2d3849' },
    highway_major_casing: { 'line-color': '#242d3b' },
    highway_major_inner: { 'line-color': '#3b475b' },
    highway_major_subtle: { 'line-color': '#3b475b' },
    highway_motorway_casing: { 'line-color': '#2a3342' },
    highway_motorway_inner: { 'line-color': '#56657c' },
    highway_motorway_subtle: { 'line-color': '#56657c' },
  },
};

type StyleLayer = { id: string; type?: string; paint?: Paint; layout?: Record<string, unknown> };
export type StyleJson = { layers: StyleLayer[] } & Record<string, unknown>;

const cache = new Map<MapTheme, Promise<StyleJson>>();
const ready = new Map<MapTheme, StyleJson>();

/** The style already loaded for a theme, if any — lets the next map open on it at once. */
export function readyMapStyle(theme: MapTheme): StyleJson | null {
  return ready.get(theme) ?? null;
}

/** The theme's base style with the palette baked in. Fetched once per theme per app run. */
export function loadMapStyle(theme: MapTheme): Promise<StyleJson> {
  let p = cache.get(theme);
  if (!p) {
    p = fetch(MAP_STYLES[theme])
      .then((r) => {
        if (!r.ok) throw new Error(`Map style ${r.status}`);
        return r.json() as Promise<StyleJson>;
      })
      .then((style) => {
        const palette = PALETTE[theme];
        style.layers = style.layers.map((l) => {
          // Paint only the properties that suit the layer's type, as the web's recolouring does.
          const own = palette[l.id];
          if (!own || !l.type) return l;
          const fitting = Object.fromEntries(Object.entries(own).filter(([k]) => k.startsWith(`${l.type}-`)));
          return { ...l, paint: { ...(l.paint ?? {}), ...fitting } };
        });
        ready.set(theme, style);
        return style;
      });
    // A failed fetch must not stick — the next map tries again.
    p.catch(() => cache.delete(theme));
    cache.set(theme, p);
  }
  return p;
}
