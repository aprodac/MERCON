import { describe, expect, it } from 'vitest';
import { filterFleet, matchesSearch, routesOf } from './fleetFilters';
import type { FleetTruck } from '@/services/trackingService';

const truck = (plate: string, ref: string, route: string | null) => ({ plate, ref, route_label: route }) as FleetTruck;

const TRUCKS = [
  truck('VRA-3358', 'TRP-0412', 'Riyadh → Al Baha'),
  truck('EXA-5999', 'TRP-0420', 'Khamis Mushayt ⇄ Muhayil'),
  truck('VSA-3071', 'TRP-0421', 'Khamis Mushayt ⇄ Muhayil'),
  truck('DRA-6484', 'TRP-0433', null),
];

describe('customer page search and route filter', () => {
  it('lists routes with the busiest first', () => {
    expect(routesOf(TRUCKS)).toEqual(['Khamis Mushayt ⇄ Muhayil', 'Riyadh → Al Baha']);
  });

  it('finds a plate however it is typed', () => {
    for (const q of ['VRA-3358', 'vra3358', 'vra 3358', '3358']) expect(matchesSearch(TRUCKS[0], q)).toBe(true);
    expect(matchesSearch(TRUCKS[0], '5999')).toBe(false);
  });

  it('finds a trip number or a place on the route', () => {
    expect(filterFleet(TRUCKS, 'trp-0420', null).map((t) => t.plate)).toEqual(['EXA-5999']);
    expect(filterFleet(TRUCKS, 'muhayil', null).map((t) => t.plate)).toEqual(['EXA-5999', 'VSA-3071']);
  });

  it('combines the route chip with the search', () => {
    expect(filterFleet(TRUCKS, '', 'Khamis Mushayt ⇄ Muhayil')).toHaveLength(2);
    expect(filterFleet(TRUCKS, '3071', 'Khamis Mushayt ⇄ Muhayil').map((t) => t.plate)).toEqual(['VSA-3071']);
    expect(filterFleet(TRUCKS, '', null)).toHaveLength(4);
  });
});
