import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tripService, Trip } from '@/services/tripService';
import { Driver } from '@/services/driverService';
import { Vehicle } from '@/services/vehicleService';
import { getCompatibilityRuleForClass } from '@/utils/vehicleCompatibilityRegistry';
import { getVehicleTypeFromCapacity, normalizeVehicleClass } from './useCreateTripForm';

export function useTripAccelerators(
  contractCustomer: string,
  customerRateCards: any[],
  contractSlots: any[],
  drivers: Driver[],
  vehicles: Vehicle[],
  contractVehicleType: string,
  handleSlotLocationChange: (
    slotId: string,
    field: 'origin' | 'destination',
    locIdOrName: string,
    locObj: any
  ) => void,
  handleDriverChange: (driverId: string) => void,
  masterVehicle: string,
  setMasterVehicle: (vehicleId: string) => void
) {
  const { data: recentTripsRes } = useQuery({
    queryKey: ['recent-trips-accelerators', contractCustomer],
    queryFn: () => tripService.getAll({ per_page: 100, lite: true }),
    staleTime: 60000,
  });
  const recentTrips: Trip[] = recentTripsRes?.data ?? [];

  const recentRoutesList = useMemo(() => {
    if (!contractCustomer) return [];

    const map = new Map<string, {
      key: string;
      origin: string;
      originLocationId: string | null;
      originLat?: number | null;
      originLng?: number | null;
      destination: string;
      destinationLocationId: string | null;
      destinationLat?: number | null;
      destinationLng?: number | null;
      stopsCount: number;
      count: number;
      lastUsedDate: Date;
      formattedLastUsed: string;
    }>();

    const formatLastUsed = (d: Date) => {
      const now = new Date();
      const diffHours = (now.getTime() - d.getTime()) / (1000 * 3600);
      if (diffHours < 24 && now.getDate() === d.getDate()) return 'Today';
      if (diffHours < 48 && (now.getDate() - d.getDate() === 1 || now.getDate() - d.getDate() === -30)) return 'Yesterday';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const customerTrips = recentTrips.filter((t) => t.customer_id === contractCustomer || t.customer?.id === contractCustomer);

    customerTrips.forEach((t) => {
      const stops = t.stops || [];
      const pickupStop = stops.find((s: any) => s.stop_type === 'Pickup' || s.sequence === 1) || stops[0];
      const dropoffStops = stops.filter((s: any) => s.stop_type === 'Dropoff');
      const dropoffStop = dropoffStops.length > 0 ? dropoffStops[dropoffStops.length - 1] : (stops.length > 1 ? stops[stops.length - 1] : null);

      const origName = (pickupStop as any)?.source_label || pickupStop?.location?.name || t.rateCard?.route_origin || '';
      const destName = (dropoffStop as any)?.source_label || dropoffStop?.location?.name || t.rateCard?.route_destination || '';

      if (!origName || !destName) return;

      const key = `${origName.toLowerCase()}->${destName.toLowerCase()}`;
      const tripDate = t.createdAt ? new Date(t.createdAt) : new Date();

      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (tripDate > existing.lastUsedDate) {
          existing.lastUsedDate = tripDate;
          existing.formattedLastUsed = formatLastUsed(tripDate);
        }
      } else {
        map.set(key, {
          key,
          origin: origName,
          originLocationId: pickupStop?.locationId || pickupStop?.location?.id || null,
          originLat: (pickupStop?.location as any)?.lat,
          originLng: (pickupStop?.location as any)?.lng,
          destination: destName,
          destinationLocationId: dropoffStop?.locationId || dropoffStop?.location?.id || null,
          destinationLat: (dropoffStop?.location as any)?.lat,
          destinationLng: (dropoffStop?.location as any)?.lng,
          stopsCount: stops.length > 0 ? stops.length : 2,
          count: 1,
          lastUsedDate: tripDate,
          formattedLastUsed: formatLastUsed(tripDate),
        });
      }
    });

    if (map.size === 0 && customerRateCards.length > 0) {
      customerRateCards.forEach((rc) => {
        const stops = rc.stops || [];
        const pickupStop = stops[0];
        const dropoffStop = stops.length > 1 ? stops[stops.length - 1] : null;

        const origName = pickupStop?.source_label || pickupStop?.location?.name || rc.route_origin || rc.origin_name || '';
        const destName = dropoffStop?.source_label || dropoffStop?.location?.name || rc.route_destination || rc.destination_name || '';

        if (!origName || !destName) return;
        const key = `${origName.toLowerCase()}->${destName.toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            origin: origName,
            originLocationId: pickupStop?.locationId || pickupStop?.location?.id || rc.originLocationId || null,
            destination: destName,
            destinationLocationId: dropoffStop?.locationId || dropoffStop?.location?.id || rc.destinationLocationId || null,
            stopsCount: stops.length > 0 ? stops.length : 2,
            count: 1,
            lastUsedDate: new Date(),
            formattedLastUsed: 'Quotation Lane',
          });
        }
      });
    }

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.lastUsedDate.getTime() - a.lastUsedDate.getTime())
      .slice(0, 4);
  }, [recentTrips, contractCustomer, customerRateCards]);

  const handleApplyRecentRoute = (route: typeof recentRoutesList[0]) => {
    const targetSlot = contractSlots[0];
    if (!targetSlot) return;

    handleSlotLocationChange(targetSlot.id, 'origin', route.origin, {
      id: route.originLocationId || '',
      name: route.origin,
      lat: route.originLat ?? null,
      lng: route.originLng ?? null,
    });

    handleSlotLocationChange(targetSlot.id, 'destination', route.destination, {
      id: route.destinationLocationId || '',
      name: route.destination,
      lat: route.destinationLat ?? null,
      lng: route.destinationLng ?? null,
    });

    toast.success(`Loaded route: ${route.origin} → ${route.destination}`);
  };

  const recentDriversList = useMemo(() => {
    const currentSlot = contractSlots[0];
    const originName = currentSlot?.origin?.toLowerCase().trim() || '';
    const destName = currentSlot?.destination?.toLowerCase().trim() || '';
    const originLocId = currentSlot?.originLocationId;
    const destLocId = currentSlot?.destinationLocationId;

    if (!originName && !originLocId) return [];
    if (!destName && !destLocId) return [];

    const norm = (s?: string | null) => String(s || '').toLowerCase().replace(/[\s,_()[\]\/{}\-.]/g, '');
    const oNorm = norm(originName);
    const dNorm = norm(destName);

    const rule = getCompatibilityRuleForClass(contractVehicleType);
    const isRuleConfigured = Boolean(rule && rule.isActive !== false && rule.allowedVehicleClassCodes.length > 0);

    const map = new Map<string, {
      driverId: string;
      driverObj: any;
      vehicleObj: any;
      count: number;
      lastUsedDate: Date;
      formattedLastUsed: string;
      score: number;
    }>();

    const formatLastUsed = (d: Date) => {
      const now = new Date();
      const diffHours = (now.getTime() - d.getTime()) / (1000 * 3600);
      if (diffHours < 24 && now.getDate() === d.getDate()) return 'Today';
      if (diffHours < 48 && (now.getDate() - d.getDate() === 1 || now.getDate() - d.getDate() === -30)) return 'Yesterday';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    recentTrips.forEach((t) => {
      if (!t.driver) return;
      if (contractCustomer && t.customer_id && t.customer_id !== contractCustomer) return;

      const stops = t.stops || [];
      const pickupStop = stops[0];
      const dropoffStop = stops.length > 1 ? stops[stops.length - 1] : null;

      const tOrigId = pickupStop?.locationId || pickupStop?.location?.id;
      const tDestId = dropoffStop?.locationId || dropoffStop?.location?.id;

      const tOrigName = norm((pickupStop as any)?.source_label || pickupStop?.location?.name || t.rateCard?.route_origin || '');
      const tDestName = norm((dropoffStop as any)?.source_label || dropoffStop?.location?.name || t.rateCard?.route_destination || '');

      let isMatch = false;
      if (originLocId && destLocId && tOrigId && tDestId) {
        if (tOrigId === originLocId && tDestId === destLocId) isMatch = true;
      }
      if (!isMatch && oNorm && dNorm && tOrigName && tDestName) {
        if ((tOrigName.includes(oNorm) || oNorm.includes(tOrigName)) && (tDestName.includes(dNorm) || dNorm.includes(tDestName))) {
          isMatch = true;
        }
      }

      if (!isMatch) return;

      const dId = t.driver.id;
      const tripDate = t.createdAt ? new Date(t.createdAt) : new Date();
      const dObj = drivers.find((d) => d.id === dId) || t.driver;
      const vObj = t.vehicle || vehicles.find((v) => v.id === (dObj as any)?.assignedVehicleId);

      const getVehicleClass = (v: any): string => {
        if (v?.capacity_kg && v.capacity_kg > 0) {
          return getVehicleTypeFromCapacity(v.capacity_kg);
        }
        return normalizeVehicleClass(v?.asset_type);
      };

      const vClass = vObj ? getVehicleClass(vObj) : contractVehicleType;

      let compScore = 1;
      if (isRuleConfigured && rule) {
        const isPref = rule.preferredVehicleClassCodes.some((c: string) => c.toLowerCase() === vClass.toLowerCase());
        const isAllow = rule.allowedVehicleClassCodes.some((c: string) => c.toLowerCase() === vClass.toLowerCase());
        if (isPref) compScore = 3;
        else if (isAllow) compScore = 2;
        else compScore = 0;
      }

      const isAvailable = (dObj as any).status === 'Available' || (dObj as any).status === 'available' || !(dObj as any).status;
      const availScore = isAvailable ? 2 : 0;
      const totalScore = compScore * 100 + availScore * 10;

      const existing = map.get(dId);
      if (existing) {
        existing.count += 1;
        if (tripDate > existing.lastUsedDate) {
          existing.lastUsedDate = tripDate;
          existing.formattedLastUsed = formatLastUsed(tripDate);
        }
        if (!existing.vehicleObj && vObj) {
          existing.vehicleObj = vObj;
        }
      } else {
        map.set(dId, {
          driverId: dId,
          driverObj: dObj,
          vehicleObj: vObj,
          count: 1,
          lastUsedDate: tripDate,
          formattedLastUsed: formatLastUsed(tripDate),
          score: totalScore,
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => (b.score + b.count) - (a.score + a.count) || b.lastUsedDate.getTime() - a.lastUsedDate.getTime())
      .slice(0, 4);
  }, [recentTrips, contractSlots, contractCustomer, drivers, vehicles, contractVehicleType]);

  const handleApplyRecentDriver = (item: typeof recentDriversList[0]) => {
    handleDriverChange(item.driverId);
    if (item.vehicleObj?.id) {
      const rule = getCompatibilityRuleForClass(contractVehicleType);
      const isRuleConfigured = Boolean(rule && rule.isActive !== false && rule.allowedVehicleClassCodes.length > 0);
      const vClass = (item.vehicleObj.capacity_kg && item.vehicleObj.capacity_kg > 0)
        ? getVehicleTypeFromCapacity(item.vehicleObj.capacity_kg)
        : normalizeVehicleClass(item.vehicleObj.asset_type);
      const isAllowed = !isRuleConfigured || (rule && rule.allowedVehicleClassCodes.some((c: string) => c.toLowerCase() === vClass.toLowerCase()));

      if (isAllowed) {
        if (!masterVehicle || masterVehicle === 'unassigned') {
          setMasterVehicle(item.vehicleObj.id);
          toast.success(`Assigned ${item.driverObj.first_name} ${item.driverObj.last_name} and suggested vehicle ${item.vehicleObj.plate_number}`);
        } else {
          toast.success(`Assigned driver ${item.driverObj.first_name} ${item.driverObj.last_name}`);
        }
      } else {
        toast.success(`Assigned driver ${item.driverObj.first_name} ${item.driverObj.last_name} (vehicle ${vClass} is not compatible with ${contractVehicleType})`);
      }
    } else {
      toast.success(`Assigned driver ${item.driverObj.first_name} ${item.driverObj.last_name}`);
    }
  };

  return {
    recentTrips,
    recentRoutesList,
    handleApplyRecentRoute,
    recentDriversList,
    handleApplyRecentDriver,
  };
}
