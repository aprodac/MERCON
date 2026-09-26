import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LiveUnit } from '@/services/fleetLiveService';

/**
 * Vector basemaps from OpenFreeMap — free, keyless, OpenMapTiles schema.
 * Liberty for light (it has parks, water, relief and road hierarchy to tint),
 * Dark for the CarPlay look. Both are recoloured by `applyMapPalette`.
 */
export const LIVE_MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export type LiveMapTheme = keyof typeof LIVE_MAP_STYLES;

type Paint = Record<string, string | number>;

/**
 * Apple Maps / CarPlay palettes, keyed by the base style's layer ids.
 * Warm paper land, green parks, clear blue water, yellow-orange highways in
 * light; deep navy with muted green and blue in dark.
 */
const PALETTE: Record<LiveMapTheme, Record<string, Paint>> = {
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

/** Base-style layers we replace with our own (Liberty ships its own 3D buildings). */
const HIDDEN: Record<LiveMapTheme, string[]> = {
  light: ['building-3d'],
  dark: [],
};

/** Recolour the loaded base style. Missing layers are skipped — styles evolve upstream. */
export function applyMapPalette(map: MapLibreMap, theme: LiveMapTheme) {
  for (const [layerId, paint] of Object.entries(PALETTE[theme])) {
    if (!map.getLayer(layerId)) continue;
    for (const [prop, value] of Object.entries(paint)) {
      try {
        map.setPaintProperty(layerId, prop, value);
      } catch {
        // Property not valid for this layer type in the upstream style — leave it.
      }
    }
  }
  for (const id of HIDDEN[theme]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
}

/** Route colours per theme — the CarPlay blue reads on both. */
export const ROUTE_COLOR: Record<LiveMapTheme, { line: string; casing: string; pending: string }> = {
  light: { line: '#1a73e8', casing: '#1a73e8', pending: '#94a3b8' },
  dark: { line: '#3fa9ff', casing: '#3fa9ff', pending: '#64748b' },
};

export const BUILDING_EXTRUSION_COLOR: Record<LiveMapTheme, string> = {
  light: '#e6e1d8',
  dark: '#2a3342',
};

/**
 * What a unit's colour means — trip state, not GPS state. Offline dims the
 * marker instead of recolouring it, so a delayed truck that lost signal is
 * still recognisably delayed.
 */
export type UnitTone = 'active' | 'delayed' | 'upcoming' | 'free';

export function unitTone(u: LiveUnit): UnitTone {
  if (!u.trip) return 'free';
  return u.trip.phase === 'delayed' ? 'delayed' : u.trip.phase === 'upcoming' ? 'upcoming' : 'active';
}

export const TONE: Record<UnitTone, { label: string; fill: string; dot: string; text: string; soft: string }> = {
  active:   { label: 'On trip',   fill: '#2563eb', dot: 'bg-blue-600',    text: 'text-blue-700 dark:text-blue-300',       soft: 'bg-blue-600/10' },
  delayed:  { label: 'Delayed',   fill: '#e11d48', dot: 'bg-rose-600',    text: 'text-rose-700 dark:text-rose-300',       soft: 'bg-rose-600/10' },
  upcoming: { label: 'Scheduled', fill: '#7c3aed', dot: 'bg-violet-600',  text: 'text-violet-700 dark:text-violet-300',   soft: 'bg-violet-600/10' },
  free:     { label: 'Free',      fill: '#059669', dot: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-300', soft: 'bg-emerald-600/10' },
};
