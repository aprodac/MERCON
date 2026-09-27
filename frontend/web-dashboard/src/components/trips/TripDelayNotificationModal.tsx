import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TripDelayNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: any;
  alert?: {
    location?: string;
    delay?: string;
    reason?: string;
    time?: string;
    videoUrl?: string;
    imageUrl?: string;
  };
}

function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.075-2.037-.481-1.612-.667-2.651-2.316-2.732-2.424-.08-.107-.655-.872-.655-1.66 0-.789.414-1.178.561-1.337.147-.16.321-.2.428-.2.107 0 .214.002.307.007.098.005.23-.038.36.275.144.348.492 1.2.535 1.288.043.088.072.19.014.305-.058.115-.087.186-.173.286-.086.1-.182.223-.26.299-.086.084-.176.175-.076.347.1.172.445.734.954 1.188.656.585 1.209.767 1.381.853.172.086.272.072.373-.043.101-.115.429-.501.544-.673.115-.172.23-.143.388-.086.158.058 1.002.472 1.175.558.173.086.288.129.33.201.042.072.042.418-.102.823z" />
    </svg>
  );
}

export default function TripDelayNotificationModal({
  isOpen,
  onClose,
  trip,
  alert,
}: TripDelayNotificationModalProps) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  React.useEffect(() => {
    setMediaError(false);
  }, [alert?.imageUrl, alert?.videoUrl]);

  const truckNo = trip?.is_third_party
    ? trip?.third_party_vehicle_plate || 'Unassigned'
    : trip?.vehicle?.plate_number || 'Unassigned';

  const driverName = trip?.is_third_party
    ? trip?.third_party_driver_name || 'Driver'
    : trip?.driver
    ? `${trip?.driver.first_name || ''} ${trip?.driver.last_name || ''}`.trim() || 'Driver'
    : 'Driver';

  const locationName = alert?.location || trip?.stops?.[0]?.location_name || 'Current Route';
  const delayDuration = alert?.delay || 'Delay Reported';
  const delayTime = alert?.time || '';
  const delayReason = alert?.reason || 'Road conditions or operational delay.';

  const handleNotifyWhatsApp = () => {
    const text = encodeURIComponent(
      `*Trip Delay Notification — MERCON Logistics*\n\n` +
      `• *Trip ID*: ${trip?.ref_id || trip?.id || '—'}\n` +
      `• *Vehicle Plate*: ${truckNo}\n` +
      `• *Driver*: ${driverName}\n` +
      `• *Location*: ${locationName}\n` +
      `• *Delay Impact*: ${delayDuration}\n` +
      `• *Reason*: ${delayReason}\n\n` +
      `Our operations dispatch team is monitoring the route.`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleAcknowledge = () => {
    setIsAcknowledged(true);
    setTimeout(() => {
      setIsAcknowledged(false);
      onClose();
    }, 900);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton
        className="sm:max-w-[560px] p-0 overflow-visible bg-transparent border-none shadow-none focus:outline-none [&>button:last-child]:hidden"
      >
        
        {/* Container: Character on left, speech card on right */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-3 pointer-events-auto">
          
          {/* ── THE DELAY ASSISTANT GUY ── */}
          <div className="w-[95px] sm:w-[120px] h-[125px] sm:h-[155px] shrink-0 select-none drop-shadow-xl flex items-end">
            <img
              src="/assistant/was there any labor charge for this trip.png"
              alt="Operations Assistant"
              className="w-full h-full object-contain object-bottom"
              draggable={false}
            />
          </div>

          {/* ── SPEECH CARD ── */}
          <div className="relative flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 sm:p-5 flex flex-col gap-3">
            
            {/* Header: Status badge & close button */}
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                  <span>Delay Alert {delayDuration}</span>
                </span>
                {delayTime && <span className="text-[11px] font-mono text-slate-400">{delayTime}</span>}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Assistant message */}
            <div className="space-y-0.5">
              <h4 className="font-extrabold text-[13.5px] text-slate-900 leading-tight">
                Delay Incident at {locationName}
              </h4>
              <p className="text-[11.5px] text-slate-600 leading-snug">
                Truck <strong className="font-mono text-slate-800">{truckNo}</strong> ({driverName}) reported a delay:{' '}
                <strong className="text-rose-600 font-bold">{delayReason}</strong>
              </p>
            </div>

            {/* ── DRIVER UPLOADED VIDEO OR PHOTO EVIDENCE ── */}
            {!mediaError && alert?.videoUrl ? (
              <div className="relative w-full h-[180px] sm:h-[210px] rounded-xl overflow-hidden bg-charcoal-strong border border-slate-800 shadow-inner flex items-center justify-center group">
                <video
                  controls
                  playsInline
                  autoPlay
                  className="w-full h-full object-contain"
                  onError={() => setMediaError(true)}
                >
                  <source src={alert.videoUrl} type="video/mp4" />
                  <source src={alert.videoUrl} type="video/quicktime" />
                  <source src={alert.videoUrl} />
                </video>
                <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between text-white text-[9.5px] font-mono pointer-events-none z-10">
                  <div className="flex items-center gap-1.5 bg-charcoal-strong/70 backdrop-blur-xs px-2 py-0.5 rounded shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="font-bold text-rose-300">DRIVER DELAY VIDEO</span>
                  </div>
                  <div className="bg-charcoal-strong/70 backdrop-blur-xs px-2 py-0.5 rounded text-amber-300 font-bold shadow">
                    {locationName}
                  </div>
                </div>
              </div>
            ) : !mediaError && alert?.imageUrl ? (
              <div className="relative w-full h-[180px] sm:h-[210px] rounded-xl overflow-hidden bg-charcoal-strong border border-slate-800 shadow-inner flex items-center justify-center group">
                <img
                  src={alert.imageUrl}
                  alt="Driver Delay Evidence"
                  className="w-full h-full object-cover"
                  onError={() => setMediaError(true)}
                />
                <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between text-white text-[9.5px] font-mono z-10">
                  <div className="flex items-center gap-1.5 bg-charcoal-strong/70 backdrop-blur-xs px-2 py-0.5 rounded shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="font-bold text-amber-300">DRIVER PHOTO EVIDENCE</span>
                  </div>
                  <div className="bg-charcoal-strong/70 backdrop-blur-xs px-2 py-0.5 rounded text-slate-200 font-bold shadow">
                    {locationName}
                  </div>
                </div>
              </div>
            ) : mediaError ? (
              <div className="w-full rounded-xl bg-amber-50/70 border border-amber-200/80 p-3.5 flex flex-col gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle size={15} />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Attachment Unavailable</span>
                      {delayTime && <span className="text-[10px] font-mono text-slate-400">{delayTime}</span>}
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      Driver uploaded delay evidence, but the file is currently unreachable on storage.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* If no driver media was uploaded, display clean operational incident details */
              <div className="w-full rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 flex flex-col gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle size={15} />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Incident Reason</span>
                      {delayTime && <span className="text-[10px] font-mono text-slate-400">{delayTime}</span>}
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {delayReason}
                    </p>
                  </div>
                </div>
                <div className="text-[10.5px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
                  <Clock size={12} className="shrink-0" />
                  <span>No delay video or photo evidence was attached by the driver.</span>
                </div>
              </div>
            )}

            {/* Acknowledgement banner */}
            {isAcknowledged && (
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                <span>Delay acknowledged and logged.</span>
              </div>
            )}

            {/* ── SIMPLE ACTIONS: 2 BUTTONS ── */}
            <div className="flex items-center gap-2 pt-0.5">
              {/* WhatsApp Notification Button */}
              <Button
                onClick={handleNotifyWhatsApp}
                className="flex-1 h-9 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer border-none"
              >
                <WhatsAppIcon className="w-4 h-4 text-white" />
                <span>Notify Customer</span>
              </Button>

              {/* Acknowledge / Close Button */}
              <Button
                onClick={handleAcknowledge}
                className="flex-1 h-9 rounded-xl bg-charcoal hover:bg-slate-800 text-white text-xs font-bold gap-1 shadow-xs cursor-pointer"
              >
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Acknowledge</span>
              </Button>
            </div>

          </div>

        </div>

      </DialogContent>
    </Dialog>
  );
}
