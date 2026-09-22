import React, { useState, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, MapPin, Clock,
  MessageCircle, Download, Share2, ZoomIn, Play,
  Video, AlertTriangle, FileText, CheckCircle2, Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { openPhotoEvidenceWhatsapp } from '@/utils/whatsappFormatter';
import { tripService } from '@/services/tripService';
import { toast } from 'sonner';

export interface LightboxPhotoItem {
  id: string;
  url: string;
  title: string;
  time?: string;
  location?: string;
  status?: string;
  category?: string;
  isVideo?: boolean;
  isDelayEvidence?: boolean;
  geotag?: {
    latitude?: number;
    longitude?: number;
    address?: string | null;
    city?: string | null;
    timestamp?: string | null;
  };
  /**
   * Populated only for external-app screenshot documents (the driver's
   * "Analyse Screenshot" workflow) — what the AI actually extracted and
   * decided, so an operator can see *why* a screenshot is Verified/Rejected
   * instead of just the bare document status.
   */
  aiVerification?: {
    eventType?: string | null;
    confidence?: number | null;
    isWrongTrip?: boolean;
    validationReason?: string | null;
    /** The Document's actual status (Verified/PendingReview/Rejected) — distinct from `status` above, which this component uses for a generic "Received" badge, not the real review state. */
    docStatus?: string | null;
  };
  /**
   * Populated for a PendingReview screenshot from the driver's EXTERNAL_APP
   * tap-to-advance flow. The driver's tap already advanced the trip using
   * "now" as a provisional timestamp — this is what lets an operator confirm
   * or correct the stop's real arrival/departure against what the
   * screenshot actually shows.
   */
  timeReview?: {
    documentId: string;
    stopId: string | null;
    recordedArrival?: string | null;
    recordedDeparture?: string | null;
  };
}

interface EvidenceLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: LightboxPhotoItem[];
  initialIndex?: number;
  tripId?: string;
  /** Called after a successful confirm/correct so the parent can refetch. */
  onEvidenceUpdated?: () => void;
  tripRef?: string;
  customerName?: string;
  customerPhone?: string;
}

export const EvidenceLightboxModal: React.FC<EvidenceLightboxModalProps> = ({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
  tripId,
  onEvidenceUpdated,
  tripRef = 'TRIP',
  customerName,
  customerPhone,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [arrivalInput, setArrivalInput] = useState('');
  const [departureInput, setDepartureInput] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  // datetime-local wants "YYYY-MM-DDTHH:mm" with no timezone/seconds.
  const toDatetimeLocal = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, photos.length]);

  const activePhoto = photos[currentIndex] || photos[0];

  useEffect(() => {
    setArrivalInput(toDatetimeLocal(activePhoto?.timeReview?.recordedArrival));
    setDepartureInput(toDatetimeLocal(activePhoto?.timeReview?.recordedDeparture));
  }, [activePhoto?.id]);

  if (!isOpen || photos.length === 0) return null;

  const currentPhoto = activePhoto;
  const hasMultiple = photos.length > 1;

  const handleConfirmTime = async () => {
    if (!tripId || !currentPhoto.timeReview?.stopId) return;
    setConfirming(true);
    try {
      const payload: { document_id: string; actual_arrival?: string; actual_departure?: string } = {
        document_id: currentPhoto.timeReview.documentId,
      };
      if (arrivalInput) payload.actual_arrival = new Date(arrivalInput).toISOString();
      if (departureInput) payload.actual_departure = new Date(departureInput).toISOString();
      await tripService.confirmEvidenceTime(tripId, currentPhoto.timeReview.stopId, payload);
      toast.success('Evidence time confirmed');
      onEvidenceUpdated?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to confirm evidence time');
    } finally {
      setConfirming(false);
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const handleShareWhatsapp = () => {
    const geotagCoords = currentPhoto.geotag?.latitude && currentPhoto.geotag?.longitude
      ? `${currentPhoto.geotag.latitude}, ${currentPhoto.geotag.longitude}`
      : undefined;

    openPhotoEvidenceWhatsapp({
      tripRef,
      customerName,
      customerPhone,
      stopName: currentPhoto.location || 'Trip Stop',
      photoCount: photos.length,
      evidenceCategory: currentPhoto.title,
      uploadTime: currentPhoto.time,
      geotagCoords,
      publicGalleryUrl: `${window.location.origin}/trips/evidence-gallery?ref=${encodeURIComponent(tripRef)}`,
    });
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentPhoto.url;
    a.download = `evidence-${tripRef}-${currentIndex + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Downloading photo evidence...');
  };

  const lat = currentPhoto.geotag?.latitude;
  const lng = currentPhoto.geotag?.longitude;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-200">
      
      {/* ── HEADER BAR ── */}
      <div className="h-14 px-4 sm:px-6 border-b border-white/10 flex items-center justify-between text-white bg-black/40 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#FA634E] text-white font-black text-xs flex items-center justify-center shadow-sm">
            {currentIndex + 1}/{photos.length}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-white truncate">
                {currentPhoto.title}
              </h3>
              {currentPhoto.isDelayEvidence && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] uppercase font-bold">
                  Delay Evidence
                </Badge>
              )}
              {currentPhoto.timeReview && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] uppercase font-bold animate-pulse">
                  Needs Time Confirmation
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {tripRef} • {currentPhoto.location || 'Operational Location'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleShareWhatsapp}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-8 px-3 rounded-lg shadow-sm border border-emerald-500/30 cursor-pointer"
          >
            <MessageCircle size={14} />
            <span className="hidden sm:inline">Send to WhatsApp</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 font-medium text-xs gap-1 h-8 px-2.5 rounded-lg cursor-pointer"
          >
            <Download size={14} />
          </Button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer ml-1"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── EXTERNAL APP TIME CONFIRMATION (needs operator review) ── */}
      {currentPhoto.timeReview && (
        <div className="px-4 sm:px-6 py-3 border-b bg-amber-950/40 border-amber-500/30 text-amber-100 shrink-0">
          <div className="flex items-start gap-2.5 text-xs mb-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
            <div>
              <span className="font-bold">Needs Time Confirmation</span>
              <span className="ml-2 opacity-90">
                The driver's tap set a provisional time — check the screenshot's real time and confirm or correct it below.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 pl-6">
            <label className="flex flex-col gap-1 text-[11px] text-amber-200/80">
              Actual Arrival
              <input
                type="datetime-local"
                value={arrivalInput}
                onChange={(e) => setArrivalInput(e.target.value)}
                className="bg-black/30 border border-amber-500/30 rounded-md px-2 py-1.5 text-xs text-white [color-scheme:dark]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-amber-200/80">
              Actual Departure
              <input
                type="datetime-local"
                value={departureInput}
                onChange={(e) => setDepartureInput(e.target.value)}
                className="bg-black/30 border border-amber-500/30 rounded-md px-2 py-1.5 text-xs text-white [color-scheme:dark]"
              />
            </label>
            <Button
              size="sm"
              onClick={handleConfirmTime}
              disabled={confirming || !tripId}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs h-8 px-3 rounded-lg"
            >
              {confirming ? 'Saving...' : 'Confirm Time'}
            </Button>
          </div>
        </div>
      )}

      {/* ── AI VERIFICATION BANNER (external-app screenshots only) ── */}
      {currentPhoto.aiVerification && (
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex items-start gap-2.5 text-xs shrink-0 ${
            currentPhoto.aiVerification.isWrongTrip || currentPhoto.aiVerification.docStatus === 'Rejected'
              ? 'bg-rose-950/50 border-rose-500/30 text-rose-200'
              : currentPhoto.aiVerification.docStatus === 'PendingReview'
              ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {currentPhoto.aiVerification.isWrongTrip || currentPhoto.aiVerification.docStatus === 'Rejected' ? (
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <span className="font-bold">
              {currentPhoto.aiVerification.isWrongTrip || currentPhoto.aiVerification.docStatus === 'Rejected'
                ? 'AI Verification Rejected'
                : currentPhoto.aiVerification.docStatus === 'PendingReview'
                ? 'AI Extracted — Awaiting Driver Confirmation'
                : 'AI Verified'}
            </span>
            {currentPhoto.aiVerification.eventType && (
              <span className="ml-2 opacity-90">
                Milestone: {currentPhoto.aiVerification.eventType.replace(/_/g, ' ')}
              </span>
            )}
            {typeof currentPhoto.aiVerification.confidence === 'number' && currentPhoto.aiVerification.confidence > 0 && (
              <span className="ml-2 opacity-90">
                • Confidence: {Math.round(currentPhoto.aiVerification.confidence * 100)}%
              </span>
            )}
            {currentPhoto.aiVerification.validationReason && (
              <div className="mt-0.5 opacity-90">{currentPhoto.aiVerification.validationReason}</div>
            )}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
        
        {/* Previous Button */}
        {hasMultiple && (
          <button
            onClick={handlePrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-[#FA634E] text-white flex items-center justify-center transition-colors border border-white/10 shadow-xl cursor-pointer"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Media Preview Container */}
        <div className="relative max-w-5xl max-h-full flex items-center justify-center rounded-xl overflow-hidden shadow-2xl">
          {currentPhoto.isVideo ? (
            <video
              src={currentPhoto.url}
              controls
              autoPlay
              className="max-h-[70vh] max-w-full rounded-xl object-contain bg-black"
            />
          ) : (
            <img
              src={currentPhoto.url}
              alt={currentPhoto.title}
              className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
          )}
        </div>

        {/* Next Button */}
        {hasMultiple && (
          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-[#FA634E] text-white flex items-center justify-center transition-colors border border-white/10 shadow-xl cursor-pointer"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* ── FOOTER METADATA PANEL ── */}
      <div className="px-6 py-3 border-t border-white/10 bg-black/60 text-white flex flex-wrap items-center justify-between gap-4 shrink-0">
        
        {/* Geotag & Time Info */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {currentPhoto.time && (
            <div className="flex items-center gap-1.5 text-slate-300">
              <Clock size={14} className="text-[#FA634E]" />
              <span>Timestamp: <strong className="text-white">{currentPhoto.time}</strong></span>
            </div>
          )}

          {currentPhoto.location && (
            <div className="flex items-center gap-1.5 text-slate-300">
              <MapPin size={14} className="text-blue-400" />
              <span>Location: <strong className="text-white">{currentPhoto.location}</strong></span>
            </div>
          )}

          {lat && lng ? (
            <a
              href={`https://maps.google.com/?q=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-mono text-[11px] bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20"
            >
              <CheckCircle2 size={12} />
              <span>GPS: {lat.toFixed(4)}, {lng.toFixed(4)}</span>
            </a>
          ) : (
            <span className="text-slate-400 text-[11px]">GPS Verified</span>
          )}
        </div>

        {/* Thumbnail Filmstrip Navigation */}
        {hasMultiple && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-md">
            {photos.map((p, idx) => (
              <button
                key={p.id || idx}
                onClick={() => setCurrentIndex(idx)}
                className={`relative w-10 h-10 rounded-md overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                  idx === currentIndex
                    ? 'border-[#FA634E] scale-105 shadow-md'
                    : p.timeReview
                    ? 'border-amber-400'
                    : 'border-white/20 opacity-60 hover:opacity-100'
                }`}
              >
                {p.isVideo ? (
                  <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">
                    <Play size={12} className="fill-white" />
                  </div>
                ) : (
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                )}
                {p.timeReview && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 shadow" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
