import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { toast } from 'sonner';
import {
  Copy,
  Check,
  Send,
  Phone,
  RotateCcw,
  User,
  Building2,
  SlidersHorizontal,
  Users,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { Trip } from '@/services/tripService';
import { customerService, Customer } from '@/services/customerService';

export interface WhatsappShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'fleet_summary' | 'single_trip' | 'company_summary';
  trips?: Trip[];
  selectedTrip?: Trip | null;
  selectedCompany?: string;
}

const isUuidVal = (str?: string | null) =>
  str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim()) : false;

const resolveStopLabel = (stop: any, fallback = '—') => {
  if (!stop) return fallback;
  const code = stop.location?.codes?.[0] || stop.location?.code;
  const locName = !isUuidVal(stop.location?.name) ? stop.location?.name : null;
  const locCity = !isUuidVal(stop.location?.city) ? stop.location?.city : null;
  const rawLocName = !isUuidVal(stop.location_name) ? stop.location_name : null;
  const rawSourceLabel = !isUuidVal(stop.source_label) ? stop.source_label : null;
  const rawAddress = !isUuidVal(stop.location_address) ? stop.location_address : null;

  const name =
    code ||
    locName ||
    locCity ||
    rawLocName ||
    rawSourceLabel ||
    rawAddress ||
    fallback;

  return String(name).replace(/🔁\s*/g, '').trim();
};

const getPickupName = (trip: Trip) => {
  const pickup = trip.stops?.find((s) => s.stop_type === 'Pickup') || trip.stops?.[0];
  return resolveStopLabel(pickup, 'Pickup Location');
};

const getDropoffName = (trip: Trip) => {
  const dropoff =
    trip.stops?.find((s) => s.stop_type === 'Dropoff') ||
    (trip.stops && trip.stops.length > 1 ? trip.stops[trip.stops.length - 1] : undefined);
  return resolveStopLabel(dropoff, 'Dropoff Location');
};

const formatTimeShort = (isoStr?: string | null) => {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '—';
  }
};

const formatTripStatusLabel = (status: string) => {
  switch (status) {
    case 'Draft':
    case 'Dispatched':
      return 'Scheduled';
    case 'AtPickup':
      return 'Loading (At Pickup)';
    case 'InTransit':
      return 'In Transit';
    case 'AtDelivery':
    case 'Completed':
      return 'Completed';
    case 'Delayed':
      return 'Delayed Alert';
    default:
      return status;
  }
};

export default function WhatsappShareModal({
  isOpen,
  onClose,
  mode = 'single_trip',
  trips = [],
  selectedTrip = null,
  selectedCompany = 'all',
}: WhatsappShareModalProps) {
  const [recipientType, setRecipientType] = useState<
    'driver' | 'customer_phone' | 'customer_whatsapp' | 'customer_group' | 'saved_select' | 'custom'
  >('custom');
  const [customTarget, setCustomTarget] = useState('');
  const [editedMessageText, setEditedMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Formatting toggles
  const [includeDriver, setIncludeDriver] = useState(true);
  const [includeVehicle, setIncludeVehicle] = useState(true);
  const [includeEta, setIncludeEta] = useState(true);
  const [includeDelays, setIncludeDelays] = useState(true);

  // Query customers to fetch saved WhatsApp numbers & groups across all accounts
  const { data: customersResponse } = useQuery({
    queryKey: ['customers-whatsapp-list'],
    queryFn: () => customerService.getAll({ per_page: 200 , mode: 'lookup' }),
    enabled: isOpen,
  });

  const allCustomers = customersResponse?.data || [];

  // Filter customers with saved WhatsApp details
  const savedGroupCustomers = useMemo(() => {
    return allCustomers.filter((c) => c.whatsapp_group_link || c.whatsapp_number);
  }, [allCustomers]);

  // Trip customer data
  const tripCustomer: Customer | null = useMemo(() => {
    if (!selectedTrip) return null;
    const custId = (selectedTrip as any).customer_id || selectedTrip.customer?.id;
    if (custId) {
      const match = allCustomers.find((c) => c.id === custId);
      if (match) return match;
    }
    return (selectedTrip.customer as Customer) || null;
  }, [selectedTrip, allCustomers]);

  // Relevant trip dataset
  const relevantTrips = useMemo(() => {
    if (selectedTrip) return [selectedTrip];
    if (selectedCompany && selectedCompany !== 'all') {
      return trips.filter(
        (t) => (t.customer?.name || (t as any).customerName) === selectedCompany
      );
    }
    return trips;
  }, [trips, selectedTrip, selectedCompany]);

  // Breakdown metrics
  const breakdown = useMemo(() => {
    const nowMs = Date.now();
    let dispatched = 0;
    let loading = 0;
    let inTransit = 0;
    let atDelivery = 0;
    let delayed = 0;

    relevantTrips.forEach((t) => {
      const isOverdue =
        ['Dispatched', 'AtPickup', 'InTransit', 'AtDelivery'].includes(t.status) &&
        t.planned_end != null &&
        new Date(t.planned_end).getTime() < nowMs;

      if (isOverdue || (t.status as string) === 'Delayed') {
        delayed++;
      }

      if (t.status === 'Scheduled' || t.status === 'Draft') dispatched++;
      else if (t.status === 'AtPickup' || t.status === 'Loading') loading++;
      else if (t.status === 'InTransit') inTransit++;
      else if (t.status === 'AtDelivery') atDelivery++;
    });

    return {
      total: relevantTrips.length,
      scheduled: dispatched,
      loading,
      inTransit,
      atDelivery,
      delayed,
    };
  }, [relevantTrips]);

  // Default generated message text
  const generatedDefaultText = useMemo(() => {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (mode === 'single_trip' && selectedTrip) {
      const pickup = getPickupName(selectedTrip);
      const dropoff = getDropoffName(selectedTrip);
      const driverName = selectedTrip.is_third_party
        ? selectedTrip.third_party_driver_name || selectedTrip.carrier_name || '3PL Driver'
        : selectedTrip.driver
        ? `${selectedTrip.driver.first_name} ${selectedTrip.driver.last_name || ''}`.trim()
        : 'Unassigned';
      const vehiclePlate = selectedTrip.is_third_party
        ? selectedTrip.third_party_vehicle_plate || '3PL Vehicle'
        : selectedTrip.vehicle?.plate_number || 'Unassigned';
      const customerName = selectedTrip.customer?.name || (selectedTrip as any).customerName || 'Logistics Partner';
      const driverPhone = selectedTrip.driver?.phone_primary || (selectedTrip.driver as any)?.phone_number || '';
      const vehicleClass = (selectedTrip.vehicle as any)?.vehicle_class || (selectedTrip.vehicle as any)?.vehicle_type || '';
      const lineType = (selectedTrip as any)?.line_type || '';
      const tripRef = selectedTrip.ref_id || selectedTrip.id;

      let text = `🚛 *Vehicle Status Update*\n\n`;
      text += `Truck # *${vehiclePlate}*\n`;
      if (includeDriver) text += `Driver Name # ${driverName}\n`;
      if (driverPhone && includeDriver) text += `Number # +${driverPhone.replace(/^\+/, '')}\n`;
      text += `Route # ${pickup} >>> ${dropoff}\n`;
      text += `Status # ${formatTripStatusLabel(selectedTrip.status)}\n`;
      if (includeEta && selectedTrip.planned_end) {
        text += `ETA # ${formatTimeShort(selectedTrip.planned_end)}\n`;
      }
      if (vehicleClass || lineType) {
        text += `\n*(${[vehicleClass, lineType].filter(Boolean).join(' - ')})*\n`;
      }
      if ((selectedTrip as any).notes) {
        text += `\nNotes # ${(selectedTrip as any).notes}\n`;
      }
      text += `\n🔗 *Evidence Gallery*:\n${window.location.origin}/trips/evidence-gallery?ref=${encodeURIComponent(tripRef)}`;
      return text;
    }

    // Summary mode fallback
    const companyHeader =
      selectedCompany && selectedCompany !== 'all'
        ? `Company: ${selectedCompany}\n`
        : `Scope: All Active Operations\n`;

    let text = `*MERCON ACTIVE TRANSIT FLEET REPORT*\n`;
    text += `Date: ${today}\n`;
    text += companyHeader;
    text += `Total Active Trips: ${breakdown.total} trips\n\n`;

    text += `STATUS BREAKDOWN:\n`;
    text += `- Scheduled: ${breakdown.scheduled}\n`;
    text += `- Loading: ${breakdown.loading}\n`;
    text += `- In Transit: ${breakdown.inTransit}\n`;
    text += `- At Delivery: ${breakdown.atDelivery}\n`;
    if (includeDelays && breakdown.delayed > 0) {
      text += `- Delayed Alerts: ${breakdown.delayed}\n`;
    }
    text += `\n-----------------------------\n`;

    if (relevantTrips.length > 0) {
      relevantTrips.slice(0, 10).forEach((t, index) => {
        const pickup = getPickupName(t);
        const dropoff = getDropoffName(t);
        const driverName = t.is_third_party
          ? t.third_party_driver_name || '3PL Driver'
          : t.driver
          ? `${t.driver.first_name} ${t.driver.last_name || ''}`.trim()
          : 'Unassigned';
        const vehiclePlate = t.vehicle?.plate_number || t.third_party_vehicle_plate || '—';
        const driverPhone = t.driver?.phone_primary || (t.driver as any)?.phone_number || '';
        const vehicleClass = (t.vehicle as any)?.vehicle_class || (t.vehicle as any)?.vehicle_type || '';
        const lineType = (t as any)?.line_type || '';

        text += `${index + 1}. ${pickup} >>> ${dropoff}`;
        if (vehicleClass) text += ` ${vehicleClass}`;
        if (lineType) text += `\n*(${lineType})*`;
        text += `\n`;
        if (includeDriver) text += `Driver Name # ${driverName}\n`;
        if (includeDriver && driverPhone) text += `Number # +${driverPhone.replace(/^\+/, '')}\n`;
        if (includeVehicle) text += `Truck No # ${vehiclePlate}\n`;
        if (includeEta && t.planned_end) text += `ETA # ${formatTimeShort(t.planned_end)}\n`;
        text += `Status # ${formatTripStatusLabel(t.status)}\n`;
        text += `\n`;
      });
    }

    text += `_MERCON Control Tower_`;
    return text;
  }, [
    mode,
    selectedTrip,
    relevantTrips,
    selectedCompany,
    breakdown,
    includeDriver,
    includeVehicle,
    includeEta,
    includeDelays,
  ]);

  // Keep message in sync with options unless manually edited
  useEffect(() => {
    if (!isEditing) {
      setEditedMessageText(generatedDefaultText);
    }
  }, [generatedDefaultText, isEditing]);

  // Auto set recipient contact when selectedTrip or tripCustomer changes
  useEffect(() => {
    if (selectedTrip) {
      if (tripCustomer?.whatsapp_group_link) {
        setCustomTarget(tripCustomer.whatsapp_group_link);
        setRecipientType('customer_group');
      } else if (tripCustomer?.whatsapp_number) {
        setCustomTarget(tripCustomer.whatsapp_number);
        setRecipientType('customer_whatsapp');
      } else {
        const driverPhone = selectedTrip.driver?.phone_primary || (selectedTrip.driver as any)?.phone_number;
        if (driverPhone) {
          setCustomTarget(driverPhone);
          setRecipientType('driver');
        } else if (selectedTrip.customer?.contact_phone) {
          setCustomTarget(selectedTrip.customer.contact_phone);
          setRecipientType('customer_phone');
        } else {
          setRecipientType('custom');
        }
      }
    }
  }, [selectedTrip, tripCustomer]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedMessageText);
      setCopied(true);
      toast.success('Message text copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy message');
    }
  };

  const isGroupLink = customTarget.includes('chat.whatsapp.com') || customTarget.startsWith('http');

  const handleSendWhatsapp = () => {
    const encodedText = encodeURIComponent(editedMessageText);

    if (isGroupLink) {
      // Copy message first, then open WhatsApp group link
      navigator.clipboard.writeText(editedMessageText);
      toast.success('Message copied to clipboard! Opening WhatsApp Group...');
      window.open(customTarget, '_blank', 'noopener,noreferrer');
      onClose();
      return;
    }

    const cleanPhone = customTarget.trim().replace(/\+/g, '').replace(/\D/g, '');
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success('Opening WhatsApp');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
        
        {/* Compact Header Bar */}
        <DialogHeader className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <WhatsAppIcon className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <DialogTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Share Trip via WhatsApp
                  {selectedTrip && (
                    <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                      #{selectedTrip.ref_id || selectedTrip.id}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-500 dark:text-slate-400">
                  Select saved customer WhatsApp group or contact number to dispatch status update.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Clean Form Body */}
        <div className="p-5 space-y-4 text-xs">
          
          {/* Recipient Selection Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                Recipient Contact or Group
              </label>

              {/* Saved Groups Quick Select Dropdown */}
              {savedGroupCustomers.length > 0 && (
                <Select
                  onValueChange={(val) => {
                    setCustomTarget(val);
                    setRecipientType('saved_select');
                  }}
                >
                  <SelectTrigger className="h-7 text-[11px] font-semibold border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 w-[200px]">
                    <SelectValue placeholder="Select Saved Group/Contact" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectGroup>
                      <SelectLabel className="text-[10px] uppercase font-bold text-slate-400">
                        Saved Customer Groups & WhatsApp Numbers
                      </SelectLabel>
                      {savedGroupCustomers.map((cust) => (
                        <div key={cust.id}>
                          {cust.whatsapp_group_link && (
                            <SelectItem value={cust.whatsapp_group_link} className="text-xs cursor-pointer">
                              <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {cust.whatsapp_group_name || cust.name + ' Group'}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[210px]">{cust.whatsapp_group_link}</span>
                            </SelectItem>
                          )}
                          {cust.whatsapp_number && (
                            <SelectItem value={cust.whatsapp_number} className="text-xs cursor-pointer">
                              <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                                <MessageSquare className="w-3.5 h-3.5" />
                                {cust.name} (WhatsApp)
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 block">{cust.whatsapp_number}</span>
                            </SelectItem>
                          )}
                        </div>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Quick Pill Buttons */}
            {selectedTrip && (
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {tripCustomer?.whatsapp_group_link && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientType('customer_group');
                      setCustomTarget(tripCustomer.whatsapp_group_link!);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                      recipientType === 'customer_group'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Group ({tripCustomer.whatsapp_group_name || 'Customer Group'})</span>
                  </button>
                )}

                {tripCustomer?.whatsapp_number && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientType('customer_whatsapp');
                      setCustomTarget(tripCustomer.whatsapp_number!);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                      recipientType === 'customer_whatsapp'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <WhatsAppIcon className="w-3 h-3 fill-emerald-600" />
                    <span>Customer WhatsApp</span>
                  </button>
                )}

                {selectedTrip.driver && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientType('driver');
                      const driverPhone = selectedTrip.driver?.phone_primary || (selectedTrip.driver as any)?.phone_number;
                      if (driverPhone) setCustomTarget(driverPhone);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      recipientType === 'driver'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Driver Phone
                  </button>
                )}

                {selectedTrip.customer?.contact_phone && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientType('customer_phone');
                      setCustomTarget(selectedTrip.customer!.contact_phone);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      recipientType === 'customer_phone'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Customer Phone
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setRecipientType('custom')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                    recipientType === 'custom'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Custom Number / Link
                </button>
              </div>
            )}

            <Input
              type="text"
              placeholder="+966 5X XXX XXXX or https://chat.whatsapp.com/..."
              value={customTarget}
              onChange={(e) => {
                setCustomTarget(e.target.value);
                setRecipientType('custom');
              }}
              className="h-8.5 text-xs font-mono border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* Clean Message Textarea Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Message Content
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditedMessageText(generatedDefaultText);
                  toast.info('Reset to default format');
                }}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Format
              </button>
            </div>

            <Textarea
              value={editedMessageText}
              onChange={(e) => {
                setIsEditing(true);
                setEditedMessageText(e.target.value);
              }}
              rows={7}
              className="font-mono text-xs leading-relaxed bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 resize-none focus-visible:ring-emerald-500"
              placeholder="Type message text..."
            />
          </div>

          {/* Options Toggles Row */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              Include:
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100">
              <input
                type="checkbox"
                checked={includeDriver}
                onChange={(e) => setIncludeDriver(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Driver</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100">
              <input
                type="checkbox"
                checked={includeVehicle}
                onChange={(e) => setIncludeVehicle(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Vehicle Plate</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100">
              <input
                type="checkbox"
                checked={includeEta}
                onChange={(e) => setIncludeEta(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>ETA</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100">
              <input
                type="checkbox"
                checked={includeDelays}
                onChange={(e) => setIncludeDelays(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Delays</span>
            </label>
          </div>

        </div>

        {/* Standard Clean DialogFooter */}
        <DialogFooter className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-3 text-xs font-semibold border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                Copy Text
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 px-3 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSendWhatsapp}
              className="h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1.5 rounded-lg cursor-pointer"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
              <span>{isGroupLink ? 'Open WhatsApp Group' : 'Send via WhatsApp'}</span>
              <Send className="w-3 h-3 ml-0.5" />
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
