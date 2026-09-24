import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Edit2, FileText, Building2, MapPin, Activity, AlertTriangle, Eye,
  Plus, RotateCw, ShieldCheck, CheckCircle2, Truck, Calendar,
  ChevronLeft, ChevronRight, TrendingUp, Sparkles, CreditCard, ArrowRight, Package, Layers, Phone, Mail,
  Trash2, UploadCloud, User, Download, ChevronDown, Car, UserCheck, Copy, PhoneCall,
  MoreVertical, Award, FolderOpen, Banknote, Gauge, Compass, Radio, Search, Tag, DollarSign, Star, Send
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { thirdPartyService, ThirdPartyProvider, ProviderRateCard, CreateProviderRateCardPayload } from '@/services/thirdPartyService';
import EditThirdPartyModal from '@/components/third-party/EditThirdPartyModal';
import ProviderRatesTab from '@/components/third-party/ProviderRatesTab';
import VisualRouteProgress from '@/components/trips/VisualRouteProgress';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';
import { exportExcelTable } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';

function renderTripCardBadge(status: string) {
  const norm = (status || '').toLowerCase().replace(/[\s\-_]+/g, '');
  if (norm === 'intransit' || norm === 'ontrip' || norm === 'inprogress') {
    return (
      <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/40 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        In Transit
      </span>
    );
  }
  if (norm === 'loading') {
    return (
      <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/40 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        Loading
      </span>
    );
  }
  if (norm === 'completed' || norm === 'delivered' || norm === 'invoiced') {
    return (
      <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/40 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        {status || 'Completed'}
      </span>
    );
  }
  return (
    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full text-[10.5px] font-black flex items-center gap-1 shadow-2xs shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
      {status || '—'}
    </span>
  );
}

function ScrollingRouteTitle({ origin, dest }: { origin: string; dest: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [origin, dest]);

  if (!isOverflowing) {
    return (
      <div ref={containerRef} className="overflow-hidden min-w-0 w-full">
        <div ref={textRef} className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight flex items-center gap-1 truncate">
          <span className="capitalize">{origin}</span>
          <span className="text-slate-900 dark:text-white font-normal mx-0.5">→</span>
          <span className="capitalize">{dest}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-hidden min-w-0 w-full relative group/route">
      <style>{`
        @keyframes routeMarquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="inline-flex items-center gap-4 whitespace-nowrap text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight group-hover/route:[animation-play-state:paused]"
        style={{
          animation: 'routeMarquee 10s linear infinite',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="capitalize">{origin}</span>
          <span className="text-slate-900 dark:text-white font-normal mx-0.5">→</span>
          <span className="capitalize">{dest}</span>
        </div>
        <span className="text-slate-400">•</span>
        <div className="flex items-center gap-1.5">
          <span className="capitalize">{origin}</span>
          <span className="text-slate-900 dark:text-white font-normal mx-0.5">→</span>
          <span className="capitalize">{dest}</span>
        </div>
        <span className="text-slate-400">•</span>
      </div>
    </div>
  );
}

function TicketCouponCard({
  children,
  isSelected,
  onClick,
  className
}: {
  children: React.ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const w = size.w || 300;
  const h = size.h || 128;
  const r = 16;
  const nr = 9;
  const cy = h / 2;

  const pathD = w > 0 ? `
    M ${r} 0
    L ${w - r} 0
    A ${r} ${r} 0 0 1 ${w} ${r}
    L ${w} ${cy - nr}
    A ${nr} ${nr} 0 0 0 ${w} ${cy + nr}
    L ${w} ${h - r}
    A ${r} ${r} 0 0 1 ${w - r} ${h}
    L ${r} ${h}
    A ${r} ${r} 0 0 1 0 ${h - r}
    L 0 ${cy + nr}
    A ${nr} ${nr} 0 0 0 0 ${cy - nr}
    L 0 ${r}
    A ${r} ${r} 0 0 1 ${r} 0
    Z
  `.replace(/\s+/g, ' ').trim() : '';

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={cn(
        "relative transition-all cursor-pointer flex group shadow-2xs min-h-[128px] rounded-2xl bg-white dark:bg-slate-900 overflow-hidden",
        className
      )}
      style={{
        clipPath: size.w > 0 ? `path('${pathD}')` : undefined,
        WebkitClipPath: size.w > 0 ? `path('${pathD}')` : undefined,
      }}
    >
      {/* SVG Vector Ticket Contour Border Overlay */}
      {size.w > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
          viewBox={`0 0 ${w} ${h}`}
        >
          <path
            d={pathD}
            fill="none"
            stroke={isSelected ? "#FA634E" : "rgba(226, 232, 240, 0.9)"}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {children}
    </div>
  );
}


const VEHICLE_CLASSES = ['3-4 TON', '5 TON', '10 TON', '20 TON', '40 FEET'];
const LINE_TYPES = ['Single Trip', 'Round Trip', '10 Hours Duty', '12 Hours Duty'];

export default function ThirdPartyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // WhatsApp share dialog state
  const [isWhatsappOpen, setIsWhatsappOpen] = useState(false);
  const [whatsappMessageText, setWhatsappMessageText] = useState('');
  const [whatsappCustomPhone, setWhatsappCustomPhone] = useState('');

  // Search query & pagination for Trips box (Left Column)
  const [tripSearch, setTripSearch] = useState('');
  const [tripPage, setTripPage] = useState(1);

  // Search query & pagination for Negotiated Rates box (Right Column)
  const [rateSearch, setRateSearch] = useState('');
  const [ratePage, setRatePage] = useState(1);

  // Selected item previews in Middle Box
  const [selectedPreviewTrip, setSelectedPreviewTrip] = useState<any | null>(null);
  const [selectedPreviewRate, setSelectedPreviewRate] = useState<ProviderRateCard | null>(null);

  // Active view tab state: default to 'overview'
  const [activeTab, setActiveTab] = useState<'overview' | 'dispatches' | 'rates'>('overview');

  // Rate Card Add/Edit Modal state
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [editingRateTarget, setEditingRateTarget] = useState<ProviderRateCard | null>(null);
  const [rateOriginCity, setRateOriginCity] = useState('');
  const [rateDestCity, setRateDestCity] = useState('');
  const [rateVehicleClass, setRateVehicleClass] = useState('10 TON');
  const [rateLineType, setRateLineType] = useState('Single Trip');
  const [ratePricingBasis, setRatePricingBasis] = useState('Per Trip');
  const [rateCost, setRateCost] = useState('');
  const [isSubmittingRate, setIsSubmittingRate] = useState(false);

  // Fetch provider details
  const { data: providerRes, isLoading, error } = useQuery({
    queryKey: ['third-party-provider', id],
    queryFn: () => thirdPartyService.getById(id!),
    enabled: !!id,
  });

  const provider: ThirdPartyProvider | null = providerRes?.data?.data || (providerRes?.data as any) || null;

  // Fetch provider rate cards
  const { data: rates = [] } = useQuery({
    queryKey: ['provider-rates', id],
    queryFn: () => thirdPartyService.getRates(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (provider && provider.id && id !== provider.id) {
      if ((provider as any).ref_id && id?.toLowerCase() === (provider as any).ref_id.toLowerCase()) {
        navigate(`/third-party/${provider.id}`, { replace: true });
      }
    }
  }, [provider?.id, (provider as any)?.ref_id, id, navigate]);

  if (isLoading) {
    return (
      <DashboardLayout active="/third-party" title="Provider Details">
        <div className="p-4 max-w-[1600px] mx-auto w-full space-y-6 animate-pulse">
          <div className="h-36 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-3 h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="lg:col-span-6 h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="lg:col-span-3 h-[400px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !provider) {
    return (
      <DashboardLayout active="/third-party" title="Provider Details">
        <div className="p-4 max-w-[1600px] mx-auto w-full flex flex-col items-center justify-center text-center h-[60vh] gap-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Third-Party Carrier Profile Not Found</h2>
          <p className="text-xs text-slate-500 max-w-md">
            The requested third-party carrier profile does not exist or has been removed from the roster.
          </p>
          <Button onClick={() => navigate('/third-party')} size="sm" className="mt-2 text-xs font-bold bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Return to Providers Directory
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['third-party-provider', id] });
    await queryClient.invalidateQueries({ queryKey: ['provider-rates', id] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDeleteProvider = async () => {
    try {
      await thirdPartyService.delete(id!);
      queryClient.invalidateQueries({ queryKey: ['third-party-providers'] });
      navigate('/third-party');
      toast.success('Carrier profile deleted');
    } catch {
      toast.error('Failed to delete carrier profile.');
    }
  };

  const openWhatsappShare = () => {
    const text =
      `*MERCON LOGISTICS - 3PL Partner Profile*\n` +
      `• *Provider:* ${provider.name}\n` +
      `• *Contact:* ${provider.contact_person || 'N/A'}\n` +
      `• *Phone:* ${provider.phone || 'N/A'}\n` +
      `• *Email:* ${provider.email || 'N/A'}\n` +
      `• *Tax ID:* ${provider.tax_id || 'N/A'}\n` +
      `• *Total Trips:* ${provider.total_trips || 0}`;
    setWhatsappMessageText(text);
    setWhatsappCustomPhone(provider.phone || '');
    setIsWhatsappOpen(true);
  };

  const handleWhatsappSend = () => {
    const cleanPhone = whatsappCustomPhone.trim().replace(/\+/g, '').replace(/\D/g, '');
    const shareUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessageText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessageText)}`;
    window.open(shareUrl, '_blank');
    setIsWhatsappOpen(false);
  };

  const handleOpenAddRate = () => {
    setEditingRateTarget(null);
    setRateOriginCity('');
    setRateDestCity('');
    setRateVehicleClass('10 TON');
    setRateLineType('Single Trip');
    setRatePricingBasis('Per Trip');
    setRateCost('');
    setIsRateModalOpen(true);
  };

  const handleOpenEditRate = (rate: ProviderRateCard) => {
    setEditingRateTarget(rate);
    setRateOriginCity(rate.origin_city);
    setRateDestCity(rate.destination_city);
    setRateVehicleClass(rate.vehicle_class);
    setRateLineType(rate.line_type);
    setRatePricingBasis(rate.pricing_basis || 'Per Trip');
    setRateCost(String(rate.cost));
    setIsRateModalOpen(true);
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateOriginCity.trim() || !rateDestCity.trim()) {
      toast.error('Origin and Destination cities are required');
      return;
    }
    const costNum = parseFloat(rateCost);
    if (isNaN(costNum) || costNum < 0) {
      toast.error('Please enter a valid cost amount');
      return;
    }

    setIsSubmittingRate(true);
    try {
      const payload: CreateProviderRateCardPayload = {
        providerId: id,
        origin_city: rateOriginCity.trim(),
        destination_city: rateDestCity.trim(),
        vehicle_class: rateVehicleClass,
        line_type: rateLineType,
        pricing_basis: ratePricingBasis,
        cost: costNum,
        status: 'active',
      };

      if (editingRateTarget) {
        await thirdPartyService.updateRate(editingRateTarget.id, payload);
        toast.success('Provider rate card updated');
      } else {
        await thirdPartyService.createRate(id!, payload);
        toast.success('Provider rate card created');
      }

      setIsRateModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['provider-rates', id] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Failed to save rate card');
    } finally {
      setIsSubmittingRate(false);
    }
  };

  const MOCK_TEST_TRIPS = [
    {
      id: 'mock-trp-8801',
      ref_id: 'TRP-8801',
      status: 'Completed',
      createdAt: '2026-09-16T10:00:00.000Z',
      planned_start: '2026-09-16T10:00:00.000Z',
      route_origin: 'Riyadh',
      route_destination: 'Dammam',
      customer: { name: 'SABIC Logistics' },
      third_party_vehicle_plate: 'KSA-4819',
      third_party_driver_name: 'Tariq Al-Mansoor',
      third_party_driver_phone: '+966501112233',
      third_party_cost: 2400.00,
      cargo_type: 'Chemical Compounds',
      rate_card_name: 'Subcontract Freight A1',
      planned_distance: 420,
      stops: [
        { id: 's1', sequence: 1, location_name: 'Riyadh Industrial City', stop_type: 'Pickup' },
        { id: 's2', sequence: 2, location_name: 'Dammam Port Terminal', stop_type: 'Dropoff' }
      ]
    },
    {
      id: 'mock-trp-8802',
      ref_id: 'TRP-8802',
      status: 'In Transit',
      createdAt: '2026-09-17T14:30:00.000Z',
      planned_start: '2026-09-17T14:30:00.000Z',
      route_origin: 'Jeddah',
      route_destination: 'Medina',
      customer: { name: 'Aramco Energy' },
      third_party_vehicle_plate: 'KSA-9920',
      third_party_driver_name: 'Omar Hassan',
      third_party_driver_phone: '+966504445566',
      third_party_cost: 1850.00,
      cargo_type: 'Spare Parts & Valves',
      rate_card_name: 'Express Line Route',
      planned_distance: 415,
      stops: [
        { id: 's3', sequence: 1, location_name: 'Jeddah Islamic Port', stop_type: 'Pickup' },
        { id: 's4', sequence: 2, location_name: 'Medina Industrial Area', stop_type: 'Dropoff' }
      ]
    },
    {
      id: 'mock-trp-8803',
      ref_id: 'TRP-8803',
      status: 'Scheduled',
      createdAt: '2026-09-18T08:00:00.000Z',
      planned_start: '2026-09-18T08:00:00.000Z',
      route_origin: 'Dammam',
      route_destination: 'Jubail',
      customer: { name: 'Al-Marai Logistics' },
      third_party_vehicle_plate: 'KSA-3021',
      third_party_driver_name: 'Khalid Al-Sayed',
      third_party_driver_phone: '+966507778899',
      third_party_cost: 950.00,
      cargo_type: 'Refrigerated Goods',
      rate_card_name: 'Cold Chain Standard',
      planned_distance: 95,
      stops: [
        { id: 's5', sequence: 1, location_name: 'Dammam Cold Hub', stop_type: 'Pickup' },
        { id: 's6', sequence: 2, location_name: 'Jubail Distribution Center', stop_type: 'Dropoff' }
      ]
    },
    {
      id: 'mock-trp-8804',
      ref_id: 'TRP-8804',
      status: 'Completed',
      createdAt: '2026-09-12T09:15:00.000Z',
      planned_start: '2026-09-12T09:15:00.000Z',
      route_origin: 'Riyadh',
      route_destination: 'Tabuk',
      customer: { name: 'Panda Retail' },
      third_party_vehicle_plate: 'KSA-7712',
      third_party_driver_name: 'Ahmed Farooq',
      third_party_driver_phone: '+966509990011',
      third_party_cost: 3600.00,
      cargo_type: 'FMCG Goods',
      rate_card_name: 'Long Haul North',
      planned_distance: 1100,
      stops: [
        { id: 's7', sequence: 1, location_name: 'Riyadh Central Warehouse', stop_type: 'Pickup' },
        { id: 's8', sequence: 2, location_name: 'Tabuk Supercenter', stop_type: 'Dropoff' }
      ]
    },
    {
      id: 'mock-trp-8805',
      ref_id: 'TRP-8805',
      status: 'Completed',
      createdAt: '2026-09-10T11:00:00.000Z',
      planned_start: '2026-09-10T11:00:00.000Z',
      route_origin: 'Abha',
      route_destination: 'Jizan',
      customer: { name: 'Olayan Group' },
      third_party_vehicle_plate: 'KSA-1188',
      third_party_driver_name: 'Faisal Al-Ghamdi',
      third_party_driver_phone: '+966503332211',
      third_party_cost: 1200.00,
      cargo_type: 'Building Materials',
      rate_card_name: 'Southern Highway Route',
      planned_distance: 200,
      stops: [
        { id: 's9', sequence: 1, location_name: 'Abha Freight Terminal', stop_type: 'Pickup' },
        { id: 's10', sequence: 2, location_name: 'Jizan Port Yard', stop_type: 'Dropoff' }
      ]
    }
  ];

  const MOCK_TEST_RATES: ProviderRateCard[] = [
    {
      id: 'mock-rate-1',
      providerId: id || '1',
      origin_city: 'Riyadh',
      destination_city: 'Dammam',
      vehicle_class: '10 TON',
      line_type: 'Single Trip',
      pricing_basis: 'Per Trip',
      cost: 2200.00,
      status: 'active',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'mock-rate-2',
      providerId: id || '1',
      origin_city: 'Jeddah',
      destination_city: 'Medina',
      vehicle_class: '20 TON',
      line_type: 'Single Trip',
      pricing_basis: 'Per Trip',
      cost: 1800.00,
      status: 'active',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z'
    },
    {
      id: 'mock-rate-3',
      providerId: id || '1',
      origin_city: 'Dammam',
      destination_city: 'Jubail',
      vehicle_class: '5 TON',
      line_type: 'Round Trip',
      pricing_basis: 'Per Trip',
      cost: 1100.00,
      status: 'active',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z'
    },
    {
      id: 'mock-rate-4',
      providerId: id || '1',
      origin_city: 'Riyadh',
      destination_city: 'Jeddah',
      vehicle_class: '40 FEET',
      line_type: 'Single Trip',
      pricing_basis: 'Per Trip',
      cost: 4500.00,
      status: 'active',
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z'
    },
    {
      id: 'mock-rate-5',
      providerId: id || '1',
      origin_city: 'Riyadh Hub',
      destination_city: 'Local Metro Area',
      vehicle_class: '10 TON',
      line_type: '12 Hours Duty',
      pricing_basis: 'Per Month',
      cost: 18500.00,
      status: 'active',
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z'
    }
  ];

  const rawTrips = (provider as any).trips || [];
  const trips = rawTrips.length > 0 ? rawTrips : MOCK_TEST_TRIPS;

  const rawRates = rates || [];
  const displayRates = rawRates.length > 0 ? rawRates : MOCK_TEST_RATES;

  const totalTripsCount = provider.total_trips || trips.length || 0;
  const activeDispatchesCount = provider.active_trips || trips.filter((t: any) => t.status === 'In Progress' || t.status === 'In Transit' || t.status === 'Assigned').length || 0;
  const completedTripsCount = trips.filter((t: any) => t.status === 'Completed' || t.status === 'Delivered').length || 0;
  const totalRentalOutlay = provider.total_cost || trips.reduce((acc: number, t: any) => acc + (Number(t.third_party_cost || 0)), 0);

  // Filter trips for left column search
  const filteredTrips = trips.filter((t: any) => {
    if (!tripSearch.trim()) return true;
    const q = tripSearch.toLowerCase();
    const ref = (t.ref_id || t.id || '').toLowerCase();
    const customerName = (t.customer?.name || '').toLowerCase();
    const driverName = (t.third_party_driver_name || '').toLowerCase();
    const plate = (t.third_party_vehicle_plate || '').toLowerCase();
    const status = (t.status || '').toLowerCase();
    return ref.includes(q) || customerName.includes(q) || driverName.includes(q) || plate.includes(q) || status.includes(q);
  });

  // Filter rates for right column search
  const filteredRates = displayRates.filter((r: ProviderRateCard) => {
    if (!rateSearch.trim()) return true;
    const q = rateSearch.toLowerCase();
    const origin = r.origin_city.toLowerCase();
    const dest = r.destination_city.toLowerCase();
    const vClass = r.vehicle_class.toLowerCase();
    const line = r.line_type.toLowerCase();
    return origin.includes(q) || dest.includes(q) || vClass.includes(q) || line.includes(q);
  });

  // Pagination constants (3 per page)
  const ITEMS_PER_PAGE = 3;

  const totalTripPages = Math.max(1, Math.ceil(filteredTrips.length / ITEMS_PER_PAGE));
  const paginatedTrips = filteredTrips.slice((tripPage - 1) * ITEMS_PER_PAGE, tripPage * ITEMS_PER_PAGE);

  const totalRatePages = Math.max(1, Math.ceil(filteredRates.length / ITEMS_PER_PAGE));
  const paginatedRates = filteredRates.slice((ratePage - 1) * ITEMS_PER_PAGE, ratePage * ITEMS_PER_PAGE);

  const handleExportLedger = async () => {
    if (!trips || trips.length === 0) return;
    
    const headers = [
      'S/L', 'DATE', 'TRIP REF', 'CUSTOMER', 'VEHICLE PLATE', '3PL DRIVER',
      'RENTAL COST (SAR)', 'STATUS'
    ];

    const rows = trips.map((t: any, index: number) => [
      index + 1,
      formatInDeploymentTz(t.createdAt || new Date(), tz, 'dd/MM/yyyy'),
      t.ref_id || `TRP-${t.id.slice(0, 5).toUpperCase()}`,
      t.customer?.name || '—',
      t.third_party_vehicle_plate || 'Rented Truck',
      t.third_party_driver_name || 'Rented Driver',
      t.third_party_cost ? Number(t.third_party_cost) : 0,
      t.status || 'Completed'
    ]);

    await exportExcelTable(
      `MERCON 3PL Partner Ledger - ${provider.name}`,
      headers,
      rows,
      `${provider.name.toLowerCase().replace(/\s+/g, '_')}_subcontract_ledger_${new Date().toISOString().slice(0,10)}.xlsx`
    );
  };

  const tripColumns: Column<any>[] = [
    {
      header: 'Trip ID',
      accessor: (row: any) => (
        <div className="flex flex-col">
          <span
            className="font-mono text-xs font-bold text-[#FA634E] hover:underline cursor-pointer"
            onClick={() => navigate(`/trips/${row.id}`)}
          >
            {row.ref_id || `TRP-${row.id.slice(0, 5).toUpperCase()}`}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            {formatInDeploymentTz(row.createdAt, tz, 'MM/dd/yyyy')}
          </span>
        </div>
      ),
    },
    {
      header: 'Customer & Vehicle',
      accessor: (row: any) => (
        <div className="flex flex-col">
          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
            {row.customer?.name || '—'}
          </span>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
            <Truck className="w-3 h-3 text-slate-400" />
            {row.third_party_vehicle_plate || 'Rented Truck'}
          </span>
        </div>
      ),
    },
    {
      header: '3PL Driver',
      accessor: (row: any) => (
        <div className="flex flex-col">
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
            {row.third_party_driver_name || 'Rented Driver'}
          </span>
          {row.third_party_driver_phone && (
            <span className="text-[10px] text-slate-400">{row.third_party_driver_phone}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Rental Fee',
      accessor: (row: any) => (
        <span className="font-bold text-xs font-mono text-slate-900 dark:text-slate-100">
          {row.third_party_cost ? `SAR ${Number(row.third_party_cost).toLocaleString()}` : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: any) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Actions',
      accessor: (row: any) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs font-semibold text-[#FA634E] hover:text-[#e0523d]"
          onClick={() => navigate(`/trips/${row.id}`)}
        >
          <Eye className="w-3.5 h-3.5 mr-1" /> View Trip
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout 
      active="/third-party" 
      title={provider.name}
      breadcrumb="3PL Partners"
      actions={
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-xl border-slate-200 dark:border-slate-800">
                <MoreVertical className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl z-50">
              <DropdownMenuItem onClick={handleRefresh} disabled={isRefreshing} className="font-semibold cursor-pointer text-xs">
                <RotateCw className={cn("w-3.5 h-3.5 mr-2", isRefreshing && "animate-spin text-[#FA634E]")} />
                Refresh Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openWhatsappShare} className="font-semibold cursor-pointer text-xs text-emerald-700 dark:text-emerald-400">
                <WhatsAppIcon className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                Share via WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportLedger} disabled={trips.length === 0} className="font-semibold cursor-pointer text-xs">
                <Download className="w-3.5 h-3.5 mr-2 text-slate-500" />
                Export Ledger (Excel)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-rose-600 font-semibold cursor-pointer text-xs">
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete Partner
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            className="h-8 px-3 rounded-xl border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5 text-[#FA634E]" /> Edit Profile
          </Button>
        </div>
      }
    >
      <div className="p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4 bg-[#EEF1F6]/40 dark:bg-slate-950">
        
        {/* ── TOP HEADER & METRICS SECTION (Matches Customer/Company Details Page Layout) ── */}
        <div className="flex items-stretch gap-4 shrink-0 mt-1">

          {/* LEFT: CARRIER INITIAL / LOGO CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xs shrink-0 w-36 sm:w-40 min-h-[140px] overflow-hidden flex items-center justify-center p-3">
            <div className="w-full h-full bg-[#3E3C3D] text-white flex items-center justify-center font-black text-4xl rounded-xl shadow-xs">
              {provider.name?.charAt(0)?.toUpperCase() || 'P'}
            </div>
          </div>

          {/* RIGHT: CARRIER NAME ABOVE + 3 KPI CARDS BELOW IN THE SAME ROW */}
          <div className="flex-1 flex flex-col justify-end gap-2 min-w-0">

            {/* Carrier Name Title Bar */}
            <div className="flex items-center justify-between gap-3 pt-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                  {provider.name}
                </h1>
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs sm:text-sm font-bold shadow-2xs border uppercase tracking-wider",
                  provider.isActive !== false
                    ? "bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                )}>
                  <span className={cn("w-2.5 h-2.5 rounded-full", provider.isActive !== false ? "bg-emerald-500" : "bg-slate-400")}></span>
                  {provider.isActive !== false ? 'Active 3PL' : 'Inactive'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl w-8 h-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:bg-slate-100">
                      <MoreVertical className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl z-50">
                    <DropdownMenuItem onClick={handleRefresh} disabled={isRefreshing} className="font-semibold cursor-pointer text-xs">
                      <RotateCw className={cn("w-3.5 h-3.5 mr-2", isRefreshing && "animate-spin text-[#FA634E]")} />
                      Refresh Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openWhatsappShare} className="font-semibold cursor-pointer text-xs text-emerald-700 dark:text-emerald-400">
                      <WhatsAppIcon className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                      Share via WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportLedger} disabled={trips.length === 0} className="font-semibold cursor-pointer text-xs">
                      <Download className="w-3.5 h-3.5 mr-2 text-slate-500" />
                      Export Ledger (Excel)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsDeleteModalOpen(true)} className="text-rose-600 font-semibold cursor-pointer text-xs">
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Delete Partner
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  onClick={() => setIsEditOpen(true)}
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                </Button>
              </div>
            </div>

            {/* 3 KPI CARDS ROW (Large Icon on Left, Vertically Middle Aligned, Values & Titles on Right) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
              {/* KPI Card 1: TOTAL SUBCONTRACT TRIPS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <Truck className="w-10 h-10 sm:w-11 sm:h-11 text-[#FA634E] stroke-[1.75] shrink-0" />
                <div className="flex flex-col items-end justify-center min-w-0 text-right">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                    SUBCONTRACT TRIPS
                  </p>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                    {totalTripsCount}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1 truncate">
                    Outsourced dispatches
                  </p>
                </div>
              </div>

              {/* KPI Card 2: ACTIVE DEPLOYMENTS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <Activity className="w-10 h-10 sm:w-11 sm:h-11 text-blue-600 dark:text-blue-400 stroke-[1.75] shrink-0" />
                <div className="flex flex-col items-end justify-center min-w-0 text-right">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                    ACTIVE DEPLOYMENTS
                  </p>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                    {activeDispatchesCount}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1 truncate">
                    Active fleet on road
                  </p>
                </div>
              </div>

              {/* KPI Card 3: TOTAL RENTAL OUTLAY */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between min-h-[96px] gap-3">
                <Banknote className="w-10 h-10 sm:w-11 sm:h-11 text-emerald-600 dark:text-emerald-400 stroke-[1.75] shrink-0" />
                <div className="flex flex-col items-end justify-center min-w-0 text-right">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                    TOTAL RENTAL OUTLAY
                  </p>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none font-mono">
                    SAR {totalRentalOutlay > 0 ? Math.round(totalRentalOutlay).toLocaleString() : '0'}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-400 mt-1 truncate">
                    Cumulative vendor spend
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Render Rates Ledger when explicit tab selected */}
        {activeTab === 'rates' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs">
            <ProviderRatesTab providerId={id!} providerName={provider.name} />
          </div>
        )}

        {/* ── MAIN UNIFIED WORKSPACE (3-Column Layout matching Company Details Alignment) ── */}
        {activeTab === 'overview' && (
          <>
            {/* ── 2. MIDDLE 3-COLUMN SPLIT GRID (3 + 6 + 3 = 12 total grid width) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              
              {/* ── COLUMN 1: SUBCONTRACTED TRIPS (Left, lg:col-span-3 - Compact Side Column) ── */}
              <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full space-y-3">
                <div className="flex flex-col h-full min-h-0 justify-between space-y-2">
                  {/* Header: Title "Trips" + Subtitle */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="w-5 h-5 text-[#FA634E] stroke-[2] shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">Trips</h3>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono font-bold">
                      {totalTripsCount}
                    </Badge>
                  </div>

                  {/* Search Bar Input for Trips */}
                  <div className="relative my-1 shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search trips..."
                      value={tripSearch}
                      onChange={(e) => {
                        setTripSearch(e.target.value);
                        setTripPage(1);
                      }}
                      className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#FA634E] focus:ring-1 focus:ring-[#FA634E] transition-all shadow-2xs"
                    />
                    {tripSearch && (
                      <button
                        onClick={() => { setTripSearch(''); setTripPage(1); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 hover:text-slate-700 bg-slate-200/60 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Paginated Trip Cards List */}
                  <div className="flex-1 space-y-3 pr-1 min-h-0 py-1">
                    {paginatedTrips.length === 0 ? (
                      <div className="h-full min-h-[220px] p-4 text-center border border-dashed border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col items-center justify-center">
                        <Truck className="w-6 h-6 text-slate-300 mx-auto mb-1.5 stroke-[1.5]" />
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No Subcontract Trips</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">No trip records found for this partner.</p>
                      </div>
                    ) : (
                      paginatedTrips.map((trip: any, idx: number) => {
                        const tripIdStr = trip.ref_id || `TRP-${trip.id?.slice(0, 5).toUpperCase() || '0742'}`;
                        const status = trip.status || 'Completed';
                        const stops = trip.stops || [];
                        const origin = trip.route_origin || trip.origin_name || stops[0]?.source_label || stops[0]?.location_name || 'Riyadh';
                        const dest = trip.route_destination || trip.destination_name || stops[stops.length - 1]?.source_label || stops[stops.length - 1]?.location_name || 'Dammam';
                        const feeStr = trip.third_party_cost ? `SAR ${Number(trip.third_party_cost).toLocaleString()}` : '—';
                        const dateStr = formatInDeploymentTz(trip.createdAt || new Date(), tz, 'dd MMM yyyy');
                        const isSelected = selectedPreviewTrip?.id === trip.id;

                        return (
                          <div
                            key={trip.id || idx}
                            onClick={() => {
                              setSelectedPreviewRate(null);
                              setSelectedPreviewTrip((prev: any) => prev?.id === trip.id ? null : trip);
                            }}
                            className={cn(
                              "relative overflow-hidden rounded-2xl border transition-all cursor-pointer flex flex-col justify-between p-3 sm:p-3.5 gap-2 group shadow-2xs",
                              isSelected
                                ? "border-[#FA634E] ring-1 ring-[#FA634E]/30 bg-white dark:bg-slate-900"
                                : "border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/50"
                            )}
                          >
                            {/* TOP ROW: TRIP ID & STATUS BADGE | RENTAL COST */}
                            <div className="flex items-center justify-between gap-2 z-10">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 font-mono leading-none tracking-tight group-hover:text-[#FA634E]">
                                  {tripIdStr}
                                </p>
                                {renderTripCardBadge(status)}
                              </div>

                              <div className="flex flex-col items-end shrink-0">
                                <span className="text-[8.5px] font-black uppercase text-[#FA634E] tracking-wider mb-0.5">
                                  Rental Cost
                                </span>
                                <span className="text-[11px] font-black font-mono text-[#FA634E] bg-orange-50 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-900/60 px-2 py-0.5 rounded-md shadow-2xs leading-none">
                                  {feeStr}
                                </span>
                              </div>
                            </div>

                            {/* MIDDLE ROW: FROM -> TO ROUTE */}
                            <div className="flex items-center gap-2 sm:gap-3 z-10 py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <MapPin className="w-4 h-4 text-[#FA634E] fill-[#FA634E]/20 shrink-0" />
                                <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 leading-tight truncate capitalize">
                                  {origin}
                                </p>
                              </div>

                              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mx-0.5" />

                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <MapPin className="w-4 h-4 text-blue-600 fill-blue-600/20 shrink-0" />
                                <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 leading-tight truncate capitalize">
                                  {dest}
                                </p>
                              </div>
                            </div>

                            {/* DIVIDER LINE */}
                            <div className="w-full h-px bg-slate-100 dark:bg-slate-800 z-10"></div>

                            {/* BOTTOM ROW: DEPARTURE | ASSIGNED DRIVER/VEHICLE */}
                            <div className="flex items-center gap-3 justify-between z-10">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                                    DATE
                                  </p>
                                  <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">
                                    {dateStr}
                                  </p>
                                </div>
                              </div>

                              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0"></div>

                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <User className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                                    CUSTOMER
                                  </p>
                                  <p className="text-[11px] font-black text-slate-900 dark:text-white truncate">
                                    {trip.customer?.name || '—'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Trips Box Pagination Controls */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between text-xs">
                      <button
                        disabled={tripPage === 1}
                        onClick={() => setTripPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-[#FA634E]" />
                        <span>Prev</span>
                      </button>
                      <span className="text-[10px] font-extrabold text-slate-500 font-mono">
                        Page {tripPage} of {totalTripPages}
                      </span>
                      <button
                        disabled={tripPage >= totalTripPages}
                        onClick={() => setTripPage((p) => Math.min(totalTripPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#FA634E]" />
                      </button>
                    </div>

                    <button
                      onClick={() => setActiveTab('dispatches' as any)}
                      className="w-full py-1.5 px-3 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-[#FA634E] hover:text-white hover:border-[#FA634E] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer group"
                    >
                      <span>View All Subcontract Trips</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── COLUMN 2: UNIFIED SINGLE MIDDLE BOX (Center, lg:col-span-6 - Displays Previews or Governance Details) ── */}
              <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full space-y-4 min-h-[460px]">
                
                {selectedPreviewTrip ? (
                  /* ── 1. TRIP PREVIEW IN MIDDLE BOX ── */
                  <div className="flex flex-col h-full justify-between space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    {/* Header Bar with Back Button & Status Badge */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                      <button
                        onClick={() => setSelectedPreviewTrip(null)}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
                        <span>Back to 3PL Partner</span>
                      </button>

                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs uppercase tracking-wider",
                        (selectedPreviewTrip.status || '').toLowerCase() === 'completed' || (selectedPreviewTrip.status || '').toLowerCase() === 'delivered'
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40"
                          : (selectedPreviewTrip.status || '').toLowerCase() === 'intransit' || (selectedPreviewTrip.status || '').toLowerCase() === 'in transit' || (selectedPreviewTrip.status || '').toLowerCase() === 'dispatched'
                          ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/40"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      )}>
                        {selectedPreviewTrip.status || 'Scheduled'}
                      </span>
                    </div>

                    {/* Trip ID Header & Date */}
                    <div className="flex items-center justify-between text-xs font-bold shrink-0 pt-1">
                      <span className="text-xl sm:text-2xl font-black font-mono text-[#FA634E]">
                        {selectedPreviewTrip.ref_id || `TRP-${selectedPreviewTrip.id?.slice(0, 4).toUpperCase() || '0742'}`}
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        Date: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{formatInDeploymentTz(selectedPreviewTrip.createdAt || selectedPreviewTrip.planned_start || new Date(), tz, 'dd MMM yyyy, HH:mm')}</strong>
                      </span>
                    </div>

                    {/* Visual Route Progress Component */}
                    {(() => {
                      const stops = selectedPreviewTrip.stops || [];
                      const origin = selectedPreviewTrip.route_origin || selectedPreviewTrip.origin_name || stops[0]?.source_label || stops[0]?.location_name || 'Riyadh';
                      const dest = selectedPreviewTrip.route_destination || selectedPreviewTrip.destination_name || stops[stops.length - 1]?.source_label || stops[stops.length - 1]?.location_name || 'Dammam';
                      const previewStops = stops.length > 0 ? stops : [
                        { id: '1', sequence: 1, location_name: origin, stop_type: 'Pickup' },
                        { id: '2', sequence: 2, location_name: dest, stop_type: 'Dropoff' }
                      ];

                      const rawPayout = Number(selectedPreviewTrip.third_party_cost || selectedPreviewTrip.driver_charge || 0);
                      const payoutStr = rawPayout > 0 ? `SAR ${rawPayout.toFixed(2)}` : '—';
                      const distanceStr = selectedPreviewTrip.planned_distance || selectedPreviewTrip.distance_km ? `${selectedPreviewTrip.planned_distance || selectedPreviewTrip.distance_km} km` : '—';

                      return (
                        <>
                          <div className="shrink-0 my-1 overflow-hidden border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40">
                            <VisualRouteProgress
                              stops={previewStops}
                              tz={tz}
                              tripStatus={selectedPreviewTrip.status || 'Completed'}
                              hideBadges={true}
                              hidePulseAnimation={true}
                            />
                          </div>

                          {/* 6 KPI Cards Grid (2 rows x 3 columns) */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 flex-1 items-stretch my-1">
                            {/* 1. CUSTOMER */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-rose-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  CUSTOMER
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.customer?.name || 'Customer Account'}
                                </span>
                              </div>
                            </div>

                            {/* 2. VEHICLE */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-blue-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  RENTED VEHICLE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.third_party_vehicle_plate || selectedPreviewTrip.vehicle?.plate_number || 'Rented Truck'}
                                </span>
                              </div>
                            </div>

                            {/* 3. CARGO TYPE */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-[#FA634E] stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  CARGO TYPE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.cargo_type || 'General Goods'}
                                </span>
                              </div>
                            </div>

                            {/* 4. RATE CARD */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-indigo-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  RATE CARD
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {selectedPreviewTrip.rate_card_name || '3PL Subcontract'}
                                </span>
                              </div>
                            </div>

                            {/* 5. DISTANCE */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-amber-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  DISTANCE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                                  {distanceStr}
                                </span>
                              </div>
                            </div>

                            {/* 6. RENTAL COST */}
                            <div className="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shadow-2xs flex flex-col justify-between min-w-0 min-h-[72px]">
                              <div className="flex items-center gap-1.5">
                                <Banknote className="w-3.5 h-3.5 text-emerald-500 stroke-[2.2] shrink-0" />
                                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                  RENTAL FEE
                                </span>
                              </div>
                              <div className="my-auto pt-0.5 min-w-0">
                                <span className="text-xs sm:text-sm font-black font-mono text-[#FA634E] truncate block">
                                  {payoutStr}
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {/* Bottom Action Button: View Full Trip Details Page */}
                    <Button
                      onClick={() => navigate(`/trips/${selectedPreviewTrip.id}`)}
                      variant="ghost"
                      className="w-full mt-2 h-11 bg-slate-100 dark:bg-slate-800/80 hover:bg-[#FA634E] hover:text-white text-slate-900 dark:text-white hover:dark:text-white text-xs sm:text-sm font-black rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                    >
                      <FileText className="w-4 h-4" />
                      <span>View Full Trip Details Page</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                ) : selectedPreviewRate ? (
                  /* ── 2. RATE CARD PREVIEW IN MIDDLE BOX ── */
                  <div className="flex flex-col h-full justify-between space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => setSelectedPreviewRate(null)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4 text-[#FA634E]" />
                        <span>Back to Overview</span>
                      </button>
                      <StatusBadge status={selectedPreviewRate.status || 'Active'} />
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto py-1 pr-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Negotiated Route Corridor</div>
                          <div className="text-xl font-black font-mono text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{selectedPreviewRate.origin_city}</span>
                            <ArrowRight className="w-4 h-4 text-[#FA634E]" />
                            <span>{selectedPreviewRate.destination_city}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carrier Roster</div>
                          <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                            {provider.name}
                          </div>
                        </div>
                      </div>

                      {/* Rate Details Grid */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] font-black uppercase text-slate-400">VEHICLE CLASS</div>
                          <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                            {selectedPreviewRate.vehicle_class}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] font-black uppercase text-slate-400">LINE TYPE</div>
                          <div className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1">
                            {selectedPreviewRate.line_type}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] font-black uppercase text-slate-400">PRICING BASIS</div>
                          <div className="text-sm font-black text-slate-800 dark:text-slate-200 mt-1">
                            {selectedPreviewRate.pricing_basis || 'Per Trip'}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                          <div className="text-[10px] font-black uppercase text-slate-400">BASELINE COST</div>
                          <div className="text-sm font-black font-mono text-[#FA634E] mt-1">
                            SAR {Number(selectedPreviewRate.cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPreviewRate(null)}
                        className="text-xs font-bold"
                      >
                        Close Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenEditRate(selectedPreviewRate)}
                        className="text-xs bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold gap-1.5 shadow-2xs"
                      >
                        <span>Edit Rate Card</span>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── 3. DEFAULT OVERVIEW MIDDLE VISUALS (Governance Details Card) ── */
                  <div className="flex flex-col h-full justify-between space-y-4">
                    {/* Section Heading & Middle 3 KPI Cards (Matching Driver Details Page Sizing & Typography) */}
                    <div className="space-y-2.5 shrink-0">
                      <div className="flex items-center gap-2 pb-0.5">
                        <TrendingUp className="w-4 h-4 text-[#FA634E] stroke-[2.2]" />
                        <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-wider">
                          3PL Partner Key Performance Indicators
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Stat 1: SUBCONTRACTS */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-center gap-2 min-h-[96px]">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            SUBCONTRACTS
                          </p>
                          <div className="flex items-center gap-3">
                            <Truck className="w-6.5 h-6.5 text-blue-600 dark:text-blue-400 stroke-[1.75] shrink-0" />
                            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none font-mono">
                              {totalTripsCount}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                            {completedTripsCount} Completed Trips
                          </p>
                        </div>

                        {/* Stat 2: ACTIVE TRIPS */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-center gap-2 min-h-[96px]">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            ACTIVE TRIPS
                          </p>
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-6.5 h-6.5 text-emerald-600 dark:text-emerald-400 stroke-[1.75] shrink-0" />
                            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none font-mono">
                              {activeDispatchesCount}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                            In Transit Now
                          </p>
                        </div>

                        {/* Stat 3: TOTAL OUTLAY */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-center gap-2 min-h-[96px]">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                            TOTAL OUTLAY
                          </p>
                          <div className="flex items-center gap-3">
                            <Banknote className="w-6.5 h-6.5 text-[#FA634E] stroke-[1.75] shrink-0" />
                            <span className="text-xl sm:text-2xl font-black text-[#FA634E] leading-none truncate font-mono">
                              {totalRentalOutlay > 0 ? `SAR ${Math.round(totalRentalOutlay / 1000)}k` : 'SAR 0'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                            Paid Subcontract Fees
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 3PL Partner Governance & Roster Details Card */}
                    <div className="flex-1 p-4 sm:p-5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
                        <div className="flex items-center gap-2.5">
                          <Building2 className="w-5 h-5 text-[#FA634E] stroke-[2.5]" />
                          <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
                            3PL Partner Governance & Details
                          </h3>
                        </div>
                        <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-200/60 shadow-2xs">
                          3PL-{provider.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1">
                        {/* 1. Carrier Legal Name */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Building2 className="w-5 h-5 text-[#FA634E] stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Legal Carrier Name
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {provider.name || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 2. Commercial / Tax ID */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <FileText className="w-5 h-5 text-blue-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Commercial / Tax ID
                            </p>
                            <p className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate">
                              {provider.tax_id || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 3. Primary Representative */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <UserCheck className="w-5 h-5 text-amber-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Representative
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {provider.contact_person || 'Not specified'}
                            </p>
                          </div>
                        </div>

                        {/* 4. Primary Phone Contact */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Phone className="w-5 h-5 text-emerald-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Primary Phone Contact
                            </p>
                            <p className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white truncate">
                              {provider.phone || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 5. Billing Email */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <Mail className="w-5 h-5 text-indigo-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Billing Email
                            </p>
                            <p className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 truncate">
                              {provider.email || '—'}
                            </p>
                          </div>
                        </div>

                        {/* 6. Physical Yard Location */}
                        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-rose-600 stroke-[2] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">
                              Yard / Office Address
                            </p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                              {provider.address || '—'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
                        <span className="font-extrabold">Partner Roster: <strong className="text-emerald-600 font-black">Active 3PL Fleet Vendor</strong></span>
                        <button
                          onClick={() => setIsEditOpen(true)}
                          className="text-[#FA634E] hover:underline font-black flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit Roster Details</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* ── COLUMN 3: NEGOTIATED RATES (Right, lg:col-span-3 - Replacing Locations Box) ── */}
              <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full space-y-3">
                <div className="flex flex-col h-full min-h-0 justify-between space-y-2">
                  {/* Header: Title "Negotiated Rates" + Subtitle + Add Button */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200/80 dark:border-orange-900/60 flex items-center justify-center shrink-0">
                        <Tag className="w-4.5 h-4.5 text-[#FA634E]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">Negotiated Rates</h3>
                        <p className="text-[11px] font-medium text-slate-400 truncate">Carrier price agreements</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                        {displayRates.length}
                      </span>
                      <button
                        onClick={handleOpenAddRate}
                        className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#FA634E] hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:border-[#FA634E]/60 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                        title="Add Rate Line"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Search Bar Input for Rates */}
                  <div className="relative my-1 shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search rates..."
                      value={rateSearch}
                      onChange={(e) => {
                        setRateSearch(e.target.value);
                        setRatePage(1);
                      }}
                      className="w-full pl-9 pr-7 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-[#FA634E] focus:ring-1 focus:ring-[#FA634E] transition-all shadow-2xs"
                    />
                    {rateSearch && (
                      <button
                        onClick={() => { setRateSearch(''); setRatePage(1); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 hover:text-slate-700 bg-slate-200/60 rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Paginated Rate Cards List */}
                  <div className="flex-1 space-y-3 pr-0.5 min-h-0 py-1">
                    {paginatedRates.length === 0 ? (
                      <div className="h-full min-h-[220px] p-4 text-center border border-dashed border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 flex flex-col items-center justify-center">
                        <Tag className="w-6 h-6 text-slate-300 mx-auto mb-1.5 stroke-[1.5]" />
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No Rates Found</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">No rate lines configured for this carrier.</p>
                        <Button
                          size="sm"
                          onClick={handleOpenAddRate}
                          className="mt-2 text-xs bg-[#FA634E] hover:bg-[#e0523d] text-white font-bold h-7 rounded-xl"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add Rate Line
                        </Button>
                      </div>
                    ) : (
                      paginatedRates.map((rate: ProviderRateCard, idx: number) => {
                        const isSelected = selectedPreviewRate?.id === rate.id;
                        const rateCodeStr = `RATE-${rate.id.slice(0, 5).toUpperCase()}`;
                        const costAmount = rate.cost || 0;
                        const origin = rate.origin_city || 'Origin';
                        const dest = rate.destination_city || 'Destination';
                        const vehicleClassStr = rate.vehicle_class || '1 Lane';

                        return (
                          <TicketCouponCard
                            key={rate.id || idx}
                            isSelected={isSelected}
                            onClick={() => {
                              setSelectedPreviewTrip(null);
                              setSelectedPreviewRate((prev: any) => prev?.id === rate.id ? null : rate);
                            }}
                          >
                            {/* LEFT MAIN SECTION */}
                            <div className="flex-1 p-3.5 sm:p-4 flex flex-col justify-between border-r border-dashed border-slate-200 dark:border-slate-800 pr-3.5 sm:pr-4 min-w-0">
                              {/* TOP ROW: ICON + RATE REF */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Tag className="w-5 h-5 text-[#FA634E] shrink-0 stroke-[2.2]" />
                                <span className="text-base font-black text-slate-900 dark:text-white font-mono leading-none tracking-tight">
                                  {rateCodeStr}
                                </span>
                              </div>

                              {/* ROUTE TITLE (SIDE-WISE MARQUEE SCROLL IF LONG) */}
                              <div className="my-2 min-w-0 w-full">
                                <ScrollingRouteTitle origin={origin} dest={dest} />
                              </div>

                              {/* HORIZONTAL DIVIDER LINE */}
                              <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-0.5"></div>

                              {/* BOTTOM ROW: DATE CREATED */}
                              <div className="flex items-center text-xs pt-0.5">
                                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                                  <Calendar className="w-4 h-4 text-slate-400 shrink-0 stroke-[1.75]" />
                                  <div>
                                    <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 block leading-none mb-0.5">
                                      CREATED
                                    </span>
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-none block">
                                      {formatInDeploymentTz(rate.createdAt || rate.updatedAt || new Date(), tz, 'dd MMM yyyy')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* RIGHT STUB SECTION */}
                            <div className="w-[115px] sm:w-[130px] shrink-0 p-3.5 sm:p-4 flex flex-col justify-between items-end pl-3.5 sm:pl-4 text-right">
                              {/* TOP RIGHT: ACTIVE TAG & VEHICLE CLASS / LANE PILL */}
                              <div className="flex flex-col items-end gap-1.5">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs flex items-center gap-1.5 leading-none shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200/90 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-orange-50 text-[#FA634E] border border-orange-200/90 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900/60 leading-none shadow-2xs">
                                  {vehicleClassStr}
                                </span>
                              </div>

                              {/* BOTTOM RIGHT: RATE AMOUNT */}
                              <div className="w-full text-right">
                                <span className="text-[8.5px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block leading-none mb-1">
                                  RATE
                                </span>
                                <span className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-white leading-none block tracking-tight">
                                  SAR {Number(costAmount).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </TicketCouponCard>
                        );
                      })
                    )}
                  </div>

                  {/* Rates Box Pagination Controls */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 text-xs">
                    <button
                      disabled={ratePage === 1}
                      onClick={() => setRatePage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors shadow-2xs cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-[#FA634E]" />
                      <span>Prev</span>
                    </button>
                    <span className="text-[10px] font-extrabold text-slate-500 font-mono">
                      Page {ratePage} of {totalRatePages}
                    </span>
                    <button
                      disabled={ratePage >= totalRatePages}
                      onClick={() => setRatePage((p) => Math.min(totalRatePages, p + 1))}
                      className="px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors shadow-2xs cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#FA634E]" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </>
        )}

        {/* ── 3. FULL-WIDTH SUBCONTRACTED TRIPS LEDGER TABLE (At Bottom) ── */}
        <Card className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-2xs overflow-hidden w-full mt-2">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Truck className="w-4 h-4 text-[#FA634E]" /> Subcontracted Trips Ledger
              </CardTitle>
              <p className="text-xs text-slate-500">Full operational history of trips subcontracted to {provider.name}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportLedger}
              disabled={trips.length === 0}
              className="h-8 text-xs font-semibold border-slate-200"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" /> Export Excel
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable
              columns={tripColumns}
              data={trips}
              emptyTitle="No Trips Executed"
              emptyMessage={`No trips have been assigned to ${provider.name} yet.`}
            />
          </CardContent>
        </Card>

        {/* ── Edit Carrier Profile Modal ── */}
        <EditThirdPartyModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          provider={provider}
          onSuccess={handleRefresh}
        />

        {/* ── Add / Edit Rate Line Dialog ── */}
        <Dialog open={isRateModalOpen} onOpenChange={setIsRateModalOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#FA634E]" />
                {editingRateTarget ? 'Edit Provider Rate Line' : 'Add Negotiated Provider Rate Line'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure baseline subcontract rates for {provider.name}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveRate} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Origin City</Label>
                  <Input
                    placeholder="e.g. Riyadh"
                    value={rateOriginCity}
                    onChange={(e) => setRateOriginCity(e.target.value)}
                    className="text-xs font-semibold rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Destination City</Label>
                  <Input
                    placeholder="e.g. Dammam"
                    value={rateDestCity}
                    onChange={(e) => setRateDestCity(e.target.value)}
                    className="text-xs font-semibold rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Vehicle Class</Label>
                  <Select value={rateVehicleClass} onValueChange={setRateVehicleClass}>
                    <SelectTrigger className="text-xs font-semibold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_CLASSES.map((cls) => (
                        <SelectItem key={cls} value={cls} className="text-xs font-semibold">
                          {cls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Line Type</Label>
                  <Select value={rateLineType} onValueChange={setRateLineType}>
                    <SelectTrigger className="text-xs font-semibold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_TYPES.map((lt) => (
                        <SelectItem key={lt} value={lt} className="text-xs font-semibold">
                          {lt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Pricing Basis</Label>
                  <Select value={ratePricingBasis} onValueChange={setRatePricingBasis}>
                    <SelectTrigger className="text-xs font-semibold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Per Trip" className="text-xs font-semibold">Per Trip</SelectItem>
                      <SelectItem value="Per Month" className="text-xs font-semibold">Per Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Baseline Cost (SAR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 1500"
                    value={rateCost}
                    onChange={(e) => setRateCost(e.target.value)}
                    className="text-xs font-semibold rounded-xl font-mono"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRateModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingRate}
                  className="bg-[#FA634E] hover:bg-[#e0523d] text-white rounded-xl text-xs font-bold"
                >
                  {isSubmittingRate ? 'Saving…' : (editingRateTarget ? 'Update Rate' : 'Save Rate')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── WhatsApp Share Modal ── */}
        <Dialog open={isWhatsappOpen} onOpenChange={setIsWhatsappOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2 text-emerald-700">
                <WhatsAppIcon className="w-5 h-5 text-emerald-600" />
                Share Partner Profile via WhatsApp
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Recipient Phone Number</Label>
                <Input
                  value={whatsappCustomPhone}
                  onChange={(e) => setWhatsappCustomPhone(e.target.value)}
                  placeholder="+966500000000"
                  className="text-xs font-mono font-bold rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Message Preview</Label>
                <textarea
                  value={whatsappMessageText}
                  onChange={(e) => setWhatsappMessageText(e.target.value)}
                  rows={6}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsWhatsappOpen(false)} className="rounded-xl text-xs font-bold">
                Cancel
              </Button>
              <Button size="sm" onClick={handleWhatsappSend} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold gap-1.5">
                <Send className="w-3.5 h-3.5" /> Open WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation Modal ── */}
        <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <DialogContent className="max-w-sm rounded-2xl text-center">
            <DialogHeader className="flex flex-col items-center">
              <AlertTriangle className="w-10 h-10 text-rose-600 mb-2" />
              <DialogTitle className="text-base font-black">Delete Partner Profile?</DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">{provider.name}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsDeleteModalOpen(false)} className="rounded-xl text-xs font-bold flex-1">
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteProvider} className="bg-rose-600 hover:bg-rose-700 rounded-xl text-xs font-bold flex-1">
                Delete Partner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
