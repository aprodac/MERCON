import { useNavigate } from 'react-router-dom';
import {
  Truck, User, ArrowRight, Gauge, ExternalLink, Navigation,
  MapPin, Flag, Clock, Package, Route as RouteIcon, Phone,
} from 'lucide-react';

import { useSimulatedTelemetry } from '@/hooks/useSimulatedTelemetry';
import TripMicroMap from '@/components/trips/TripMicroMap';
import { cn } from '@/lib/utils';

// Shadcn UI primitives
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, useCarousel,
} from '@/components/ui/carousel';
import StatusBadge from '@/components/ui/StatusBadge';

const ROUTE_KEYS: Record<string, string> = {
  'TRP-8922': 'dammam-riyadh',
  'TRP-8923': 'medina-mecca',
  'TRP-8924': 'riyadh-tabuk',
};

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatEta(minutes: number) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Carousel-aware header controls: position readout, dots, prev/next. */
function CarouselToolbar({ total }: { total: number }) {
  const { selectedIndex, scrollSnaps, scrollTo } = useCarousel();

  return (
    <div className="flex items-center gap-2">
      <span className="hidden font-mono text-xs font-bold tabular-nums text-muted-foreground sm:inline-block">
        {Math.min(selectedIndex + 1, total)} / {total}
      </span>

      <div className="hidden items-center gap-1 md:flex" role="tablist" aria-label="Trip slides">
        {scrollSnaps.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === selectedIndex}
            aria-label={`Go to trip ${i + 1}`}
            onClick={() => scrollTo(i)}
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              i === selectedIndex ? 'bg-brand' : 'bg-foreground/15 hover:bg-foreground/30'
            )}
          />
        ))}
      </div>

      <div className="relative flex items-center gap-1.5">
        <CarouselPrevious className="static size-7 translate-y-0 rounded-full disabled:opacity-30" />
        <CarouselNext className="static size-7 translate-y-0 rounded-full disabled:opacity-30" />
      </div>
    </div>
  );
}

export default function TripCardSwiper() {
  const navigate = useNavigate();
  const { fleet } = useSimulatedTelemetry(1);

  return (
    <TooltipProvider delay={200}>
      <Carousel
        opts={{ align: 'start', containScroll: 'trimSnaps', dragFree: false }}
        className="shrink-0"
      >
        <Card className="overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-black/[0.06]">
          <CardHeader className="border-b border-black/[0.04] pb-3.5">
            <CardTitle className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-[#111]">
              <span className="inline-flex size-2 rounded-full bg-brand" />
              Active Freight Trips Carousel
              <Badge
                variant="outline"
                className="border-brand/25 bg-brand/8 font-mono text-[10px] text-brand"
              >
                {fleet.length} TRIPS
              </Badge>
            </CardTitle>

            <CardDescription className="text-xs text-[#6E6E80]">
              Swipe, drag or use the arrow keys to inspect active manifest cards — click any card for full details
            </CardDescription>

            <CardAction>
              <CarouselToolbar total={fleet.length} />
            </CardAction>
          </CardHeader>

          <CardContent>
            <CarouselContent className="-ml-3.5 py-1">
              {fleet.map((truck) => (
                <CarouselItem
                  key={truck.tripId}
                  className="basis-[286px] pl-3.5"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/trips/${truck.tripId}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/trips/${truck.tripId}`);
                      }
                    }}
                    className={cn(
                      'group relative cursor-pointer select-none space-y-2.5 rounded-lg border border-black/[0.08] bg-white p-3.5',
                      'transition-colors duration-150',
                      'hover:border-brand/50 hover:shadow-sm',
                      'focus-visible:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
                    )}
                  >
                    {/* Header: Ref ID, plate & status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-brand">
                          {truck.refId}
                        </span>
                        <p className="flex items-center gap-1 text-xs font-black leading-tight text-[#111] transition-colors group-hover:text-brand">
                          <span className="truncate">{truck.plateNumber}</span>
                          <ArrowRight size={12} className="shrink-0 text-brand" />
                        </p>
                      </div>
                      <StatusBadge status={truck.status} />
                    </div>

                    {/* Route micro-map */}
                    <div className="overflow-hidden rounded-md border border-black/[0.06]">
                      <TripMicroMap
                        currentLat={truck.currentCoords.lat}
                        currentLng={truck.currentCoords.lng}
                        heading={truck.heading}
                        pickupCoords={truck.pickupCoords}
                        dropoffCoords={truck.dropoffCoords}
                        routeKey={ROUTE_KEYS[truck.refId] ?? 'riyadh-jeddah'}
                      />
                    </div>

                    <div className="flex items-center justify-between px-0.5 font-mono text-[9px] font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Navigation size={9} className="shrink-0" />
                        {truck.distanceRemainingKm} km left
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={9} className="shrink-0" />
                        ETA {formatEta(truck.etaMinutes)}
                      </span>
                    </div>

                    {/* Origin → Destination corridor */}
                    <div className="rounded-md border border-black/[0.06] bg-white p-2">
                      <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                        <RouteIcon size={9} /> Route Corridor
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-[#111]">
                        <MapPin size={10} className="shrink-0 text-brand" />
                        <span className="truncate">{truck.originName.split(' ')[0]}</span>
                        <Separator className="flex-1" />
                        <span className="truncate text-right">{truck.destinationName.split(' ')[0]}</span>
                        <Flag size={10} className="shrink-0 text-brand" />
                      </div>
                    </div>

                    {/* Driver & vehicle summary */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-default rounded-md border border-black/[0.06] bg-white p-2 text-left transition-colors hover:border-black/[0.14]"
                          >
                            <p className="flex items-center gap-0.5 text-[8px] font-bold uppercase text-muted-foreground">
                              <User size={9} /> Driver
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <Avatar className="size-4">
                                <AvatarFallback className="bg-brand/10 text-[7px] font-bold text-brand">
                                  {truck.driverName ? truck.driverName.charAt(0) : 'D'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate text-[10px] font-bold text-[#111]">
                                {truck.driverName ? truck.driverName.split(' ')[0] : 'Assigned'}
                              </span>
                            </div>
                          </div>
                        </HoverCardTrigger>

                        <HoverCardContent side="top" className="w-56 p-3">
                          <div className="space-y-1">
                            <p className="text-xs font-extrabold text-[#111]">{truck.driverName || 'Primary Driver'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">
                              Assigned Fleet Driver — Mercon Logistics
                            </p>
                            {truck.driverPhone && (
                              <p className="font-mono text-[10px] font-semibold text-brand">
                                {truck.driverPhone}
                              </p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>

                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="cursor-default rounded-md border border-black/[0.06] bg-white p-2 text-left transition-colors hover:border-black/[0.14]"
                            />
                          }
                        >
                          <p className="flex items-center gap-0.5 text-[8px] font-bold uppercase text-muted-foreground">
                            <Truck size={9} /> Vehicle
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Package size={10} className="shrink-0 text-brand" />
                            <span className="truncate text-[10px] font-bold text-[#111]">
                              {truck.assetType}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {truck.assetType} — {truck.cargoType}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Speed & progress */}
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="flex items-center gap-1 text-brand">
                          <Gauge size={11} />
                          {truck.speedKmH} km/h
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {truck.progressPercentage}%
                        </span>
                      </div>
                      <Progress
                        value={truck.progressPercentage}
                        className={cn(
                          '[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-black/[0.06]',
                          '[&_[data-slot=progress-indicator]]:bg-brand [&_[data-slot=progress-indicator]]:duration-500'
                        )}
                      />
                      <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                        <span>{truck.distanceCompletedKm} km done</span>
                        <span>{truck.distanceRemainingKm} km left</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <Button
                      size="sm"
                      className="h-7 w-full gap-1 rounded-md bg-[#1C1C2E] text-[10px] font-bold text-white transition-colors group-hover:bg-brand"
                      tabIndex={-1}
                    >
                      View Full Details
                      <ExternalLink size={10} />
                    </Button>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </CardContent>
        </Card>
      </Carousel>
    </TooltipProvider>
  );
}
