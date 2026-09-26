import React from 'react';
import {
  FileText, Camera, MapPin, PenTool, Scale,
  UploadCloud, Eye, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModernLiveDocumentsProps {
  documents: any[];
  onUploadClick: () => void;
  onPreview: (img: { url: string; title: string; date?: string }) => void;
  onOpenLiveMap?: () => void;
}

function resolveFileUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (!trimmed.startsWith('/') && trimmed.length > 30 && !trimmed.includes(' ')) {
    return `data:image/png;base64,${trimmed}`;
  }
  const base = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : '';
  return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

const DOCUMENT_CARDS = [
  {
    id: 'pod',
    title: 'POD',
    icon: FileText,
    iconColor: 'text-blue-600',
    status: 'Received',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    subText: 'Received',
    timeText: 'Sep 02, 2026, 02:14 PM',
    sampleImg: '/document-assets/pod_sample.png',
    isMap: false,
  },
  {
    id: 'photos',
    title: 'Live Photos',
    icon: Camera,
    iconColor: 'text-sky-600',
    status: 'Available',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    subText: '3 photos',
    timeText: 'Last photo: 02:16 PM',
    sampleImg: '/document-assets/cargo_photos_sample.png',
    isMap: false,
  },
  {
    id: 'location',
    title: 'Live Location',
    icon: MapPin,
    iconColor: 'text-blue-600',
    status: 'Active',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    subText: 'Last Updated',
    timeText: '2 min ago',
    sampleImg: '/document-assets/live_location_sample.png',
    isMap: true,
  },
  {
    id: 'signature',
    title: 'E-Signature',
    icon: PenTool,
    iconColor: 'text-indigo-600',
    status: 'Completed',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    subText: 'Signed by',
    timeText: 'Customer Representative',
    sampleImg: '/document-assets/signature_sample.png',
    isMap: false,
  },
  {
    id: 'weight',
    title: 'Weight Slip',
    icon: Scale,
    iconColor: 'text-cyan-600',
    status: 'Captured',
    statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    subText: 'Captured',
    timeText: 'Sep 02, 2026, 01:58 PM',
    sampleImg: '/document-assets/weight_slip_sample.png',
    isMap: false,
  },
];

export default function ModernLiveDocuments({
  documents,
  onUploadClick,
  onPreview,
  onOpenLiveMap,
}: ModernLiveDocumentsProps) {
  const totalItemsCount = Math.max(documents.length, 5);

  return (
    <div className="w-full h-full bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-3.5 flex flex-col justify-between overflow-hidden">
      {/* Header Row */}
      <div className="flex items-center justify-between pb-2 border-b border-[#F3F4F6] shrink-0">
        <div>
          <h3 className="font-bold text-[14px] text-[#1F2937] leading-tight">Live Documents</h3>
          <p className="text-[11px] text-[#6B7280] font-normal">
            Real-time documents and live uploads from the field
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            {totalItemsCount} Items
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={onUploadClick}
            className="h-7.5 px-3 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold gap-1.5 shadow-none cursor-pointer"
          >
            <UploadCloud size={13} />
            <span>Upload Document</span>
          </Button>
        </div>
      </div>

      {/* 5 Modern Horizontal Document Cards */}
      <div className="grid grid-cols-5 gap-3 pt-2">
        {DOCUMENT_CARDS.map((card, idx) => {
          const matchedRealDoc = documents[idx];
          const displayImg = matchedRealDoc?.file_url
            ? resolveFileUrl(matchedRealDoc.file_url)
            : card.sampleImg;

          const IconComp = card.icon;

          return (
            <div
              key={card.id}
              className="bg-white border border-[#E5E7EB] hover:border-blue-300 rounded-xl p-2 flex flex-col justify-between transition-all hover:shadow-xs group"
            >
              {/* Card Top: Icon, Title, Status Badge */}
              <div className="flex items-center justify-between gap-1 pb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <IconComp size={13} className={card.iconColor} />
                  <span className="font-bold text-[11.5px] text-[#1F2937] truncate">
                    {card.title}
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9.5px] font-semibold border ${card.statusColor}`}
                >
                  {card.status}
                </span>
              </div>

              {/* Card Middle: Preview Thumbnail */}
              <div
                onClick={() => {
                  if (card.isMap && onOpenLiveMap) {
                    onOpenLiveMap();
                  } else {
                    onPreview({
                      url: displayImg,
                      title: card.title,
                      date: card.timeText,
                    });
                  }
                }}
                className="relative w-full aspect-[16/10] rounded-lg overflow-hidden bg-slate-100 border border-slate-200 my-1 cursor-pointer group"
              >
                <img
                  src={displayImg}
                  alt={card.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />

                {/* Hover overlay with eye */}
                <div className="absolute inset-0 bg-charcoal-strong/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Eye size={14} />
                </div>
              </div>

              {/* Card Bottom: Metadata + View Action */}
              <div className="pt-0.5 space-y-0.5">
                <p className="text-[9.5px] font-medium text-[#6B7280] leading-tight">
                  {card.subText}
                </p>
                <p className="text-[9.5px] font-mono font-medium text-[#374151] truncate leading-tight">
                  {card.timeText}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    if (card.isMap && onOpenLiveMap) {
                      onOpenLiveMap();
                    } else {
                      onPreview({
                        url: displayImg,
                        title: card.title,
                        date: card.timeText,
                      });
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 pt-0.5 cursor-pointer leading-tight"
                >
                  <Eye size={11} />
                  <span>View</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
