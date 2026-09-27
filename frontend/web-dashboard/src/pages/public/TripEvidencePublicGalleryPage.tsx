import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Camera, MapPin, Clock, CheckCircle2, ShieldCheck, Download, Share2, 
  Play, Video, FileText, AlertTriangle, Truck, User, ArrowRight, X 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/api';

function resolveDocUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  let base = import.meta.env.VITE_API_URL || '';
  if (base.includes('/api')) {
    base = base.split('/api')[0];
  }
  return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export default function TripEvidencePublicGalleryPage() {
  const [searchParams] = useSearchParams();
  const tripRef = searchParams.get('ref') || searchParams.get('token') || '';
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);

  const { data: galleryRes, isLoading, isError, error } = useQuery({
    queryKey: ['public-evidence-gallery', tripRef],
    queryFn: async () => {
      if (!tripRef) return null;
      const res = await api.get(`/public/evidence-gallery?ref=${encodeURIComponent(tripRef)}`);
      return res.data?.data;
    },
    enabled: Boolean(tripRef),
  });

  const tripData = galleryRes || null;
  const documents: any[] = tripData?.documents || [];

  const handleShareUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Public Evidence Link copied to clipboard!');
    }
  };

  return (
    <div className="min-h-screen bg-charcoal-strong text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-charcoal/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8.5 h-8.5 rounded-xl bg-[#FA634E] flex items-center justify-center font-black text-white text-sm shadow-md">
            M
          </div>
          <div>
            <h1 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <span>MERCON Evidence Gallery</span>
              <Badge className="bg-[#FA634E]/20 text-[#FA634E] border-[#FA634E]/30 text-[10px]">
                Official
              </Badge>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              Trip #{tripRef || 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareUrl}
            className="text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white gap-1.5"
          >
            <Share2 size={13} />
            <span className="hidden sm:inline">Share Link</span>
          </Button>

          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[11px] font-bold gap-1 px-3 py-1">
            <ShieldCheck size={13} />
            <span>Verified Audit</span>
          </Badge>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#FA634E] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">Retrieving verified trip evidence & video records...</p>
          </div>
        )}

        {/* Error / Invalid Link State */}
        {isError && (
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-8 text-center max-w-md mx-auto my-8">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h2 className="text-base font-bold text-white">Invalid or Expired Share Link</h2>
            <p className="text-xs text-rose-300/80 mt-1">
              {(error as any)?.response?.data?.error?.message || 'Could not find evidence documents for this trip reference.'}
            </p>
          </div>
        )}

        {/* Valid Trip Summary Banner */}
        {tripData && (
          <>
            {/* Trip Meta Card */}
            <div className="bg-charcoal border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[11px] font-bold text-[#FA634E] uppercase tracking-wider">
                    {tripData.customerName}
                  </span>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                    <span>{tripData.pickupLocation}</span>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <span>{tripData.dropoffLocation}</span>
                  </h2>
                </div>

                <Badge className="bg-slate-800 text-slate-200 border-slate-700 text-xs px-3 py-1 font-mono self-start sm:self-auto">
                  Status: {tripData.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <User size={14} className="text-slate-500 shrink-0" />
                  <span className="truncate">Driver: {tripData.driverName}</span>
                </div>

                <div className="flex items-center gap-2 text-slate-300">
                  <Truck size={14} className="text-slate-500 shrink-0" />
                  <span className="truncate">Truck: {tripData.vehiclePlate}</span>
                </div>

                <div className="flex items-center gap-2 text-slate-300 col-span-2 sm:col-span-1">
                  <Camera size={14} className="text-[#FA634E] shrink-0" />
                  <span>Evidence: {documents.length} File(s)</span>
                </div>
              </div>
            </div>

            {/* Document / Video Gallery Grid */}
            {documents.length === 0 ? (
              <div className="bg-charcoal/50 border border-slate-800 rounded-2xl p-12 text-center">
                <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-300">No Evidence Documents Uploaded Yet</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Trip evidence and photos uploaded by the driver will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map((doc) => {
                  const mediaUrl = resolveDocUrl(doc.url);

                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="bg-charcoal border border-slate-800 rounded-2xl overflow-hidden cursor-pointer group hover:border-[#FA634E] transition-all flex flex-col justify-between shadow-md"
                    >
                      {/* Media Thumbnail Container */}
                      <div className="aspect-video relative bg-charcoal-strong overflow-hidden flex items-center justify-center">
                        {doc.isVideo ? (
                          <div className="relative w-full h-full bg-charcoal-strong flex flex-col items-center justify-center">
                            <video
                              src={mediaUrl}
                              preload="metadata"
                              className="w-full h-full object-cover opacity-60"
                            />
                            <div className="absolute z-10 w-12 h-12 rounded-full bg-[#FA634E] text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                              <Play className="w-6 h-6 ml-0.5 fill-white" />
                            </div>
                            <span className="absolute bottom-2 left-2 bg-charcoal-strong/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <Video size={10} className="text-amber-400" />
                              <span>Video Evidence</span>
                            </span>
                          </div>
                        ) : (
                          <img
                            src={mediaUrl}
                            alt={doc.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}

                        {/* Top Category Badge */}
                        <div className="absolute top-2 left-2 z-10">
                          <Badge className={`text-[10px] font-bold px-2 py-0.5 border-0 ${
                            doc.isDelay 
                              ? 'bg-rose-500 text-white' 
                              : 'bg-charcoal-strong/70 backdrop-blur-xs text-white'
                          }`}>
                            {doc.category}
                          </Badge>
                        </div>
                      </div>

                      {/* Info Footer */}
                      <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-bold text-xs text-white line-clamp-1">{doc.title}</h3>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                            <span className="truncate">{doc.location}</span>
                            <span className="font-mono text-[10px] text-amber-400 shrink-0">{doc.time}</span>
                          </div>
                        </div>

                        {doc.lat && doc.lng && (
                          <div className="pt-2 border-t border-slate-800/80 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <CheckCircle2 size={11} className="shrink-0" />
                            <span className="truncate">GPS: {Number(doc.lat).toFixed(4)}, {Number(doc.lng).toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox / Video Viewer Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-strong/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl bg-charcoal border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-charcoal-strong">
              <div>
                <Badge className="bg-[#FA634E] text-white border-0 text-xs">
                  {selectedDoc.category}
                </Badge>
                <h3 className="text-sm font-bold text-white mt-1">
                  {selectedDoc.title}
                </h3>
              </div>

              <button 
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Media Body */}
            <div className="p-6 bg-charcoal-strong flex items-center justify-center flex-1 overflow-auto">
              {selectedDoc.isVideo ? (
                <video
                  controls
                  autoPlay
                  src={resolveDocUrl(selectedDoc.url)}
                  className="max-h-[65vh] w-full rounded-xl shadow-xl"
                />
              ) : (
                <img
                  src={resolveDocUrl(selectedDoc.url)}
                  alt={selectedDoc.title}
                  className="max-h-[65vh] object-contain rounded-xl shadow-xl"
                />
              )}
            </div>

            {/* Modal Footer Info */}
            <div className="px-6 py-4 border-t border-slate-800 bg-charcoal-strong flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
              <div className="flex items-center gap-4">
                <span>Location: <strong>{selectedDoc.location}</strong></span>
                <span>Time: <strong>{selectedDoc.time}</strong></span>
              </div>

              <a
                href={resolveDocUrl(selectedDoc.url)}
                target="_blank"
                rel="noreferrer"
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 text-xs font-semibold"
              >
                <Download size={13} />
                <span>Download Media File</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-4 text-center text-slate-500 text-xs border-t border-slate-800/80">
        Powered by MERCON Logistics Operating System • Verified Evidence Gallery
      </footer>
    </div>
  );
}
