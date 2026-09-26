import React from 'react';
import { Card } from '@/components/ui/card';
import {
  FileCheck,
  Camera,
  MapPin,
  PenTool,
  Scale,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentItem {
  id: string;
  type: 'POD' | 'Live Photos' | 'Live Location' | 'E-Signature' | 'Weight Slip';
  badge: string;
  badgeTone: 'green' | 'blue' | 'amber';
  subLabel: string;
  dateStr: string;
  thumbnailUrl?: string;
  svgThumbnail?: 'map' | 'signature' | 'scale';
}

interface TripLiveDocumentsGridProps {
  documents?: DocumentItem[];
  onPreviewDoc?: (doc: DocumentItem) => void;
}

export default function TripLiveDocumentsGrid({
  documents = [],
  onPreviewDoc,
}: TripLiveDocumentsGridProps) {
  // Default 5-card seed items from reference image
  const displayDocs: DocumentItem[] =
    documents.length > 0
      ? documents
      : [
          {
            id: 'pod',
            type: 'POD',
            badge: 'Received',
            badgeTone: 'green',
            subLabel: 'Received',
            dateStr: 'Sep 02, 2026, 02:14 PM',
            svgThumbnail: 'signature',
          },
          {
            id: 'photos',
            type: 'Live Photos',
            badge: 'Available',
            badgeTone: 'green',
            subLabel: '3 photos',
            dateStr: 'Last photo: 02:16 PM',
            thumbnailUrl: '/truck_3d_orange_transparent.png',
          },
          {
            id: 'location',
            type: 'Live Location',
            badge: 'Active',
            badgeTone: 'green',
            subLabel: 'Last Updated',
            dateStr: '2 min ago',
            svgThumbnail: 'map',
          },
          {
            id: 'signature',
            type: 'E-Signature',
            badge: 'Completed',
            badgeTone: 'green',
            subLabel: 'Signed by',
            dateStr: 'Customer Representative',
            svgThumbnail: 'signature',
          },
          {
            id: 'weight',
            type: 'Weight Slip',
            badge: 'Captured',
            badgeTone: 'green',
            subLabel: 'Captured',
            dateStr: 'Sep 02, 2026, 01:58 PM',
            svgThumbnail: 'scale',
          },
        ];

  const getDocIcon = (type: DocumentItem['type']) => {
    switch (type) {
      case 'POD':
        return <FileCheck size={16} className="text-blue-600 dark:text-blue-400" />;
      case 'Live Photos':
        return <Camera size={16} className="text-[#FA634E]" />;
      case 'Live Location':
        return <MapPin size={16} className="text-emerald-600 dark:text-emerald-400" />;
      case 'E-Signature':
        return <PenTool size={16} className="text-indigo-600 dark:text-indigo-400" />;
      case 'Weight Slip':
        return <Scale size={16} className="text-amber-600 dark:text-amber-400" />;
    }
  };

  return (
    <Card className="rounded-2xl border border-black/[0.08] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
      {/* Title Header */}
      <div>
        <h3 className="text-base font-extrabold text-[#3E3C3D] dark:text-slate-100 tracking-tight">
          Live Documents
        </h3>
        <p className="text-xs text-[#6E6E80] dark:text-slate-400 font-medium">
          Real-time documents and live uploads from the field
        </p>
      </div>

      {/* 5-Card Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {displayDocs.map((doc) => (
          <div
            key={doc.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 space-y-2 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all group"
          >
            {/* Top Row: Icon + Type Name + Status Pill */}
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {getDocIcon(doc.type)}
                <span className="text-xs font-bold text-[#3E3C3D] dark:text-slate-100 truncate">
                  {doc.type}
                </span>
              </div>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px] font-extrabold shrink-0">
                {doc.badge}
              </span>
            </div>

            {/* Thumbnail Box */}
            <div className="w-full h-24 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center relative">
              {doc.svgThumbnail === 'map' ? (
                <div className="w-full h-full bg-sky-50 dark:bg-slate-900 flex flex-col items-center justify-center p-2 relative">
                  <div className="w-full h-1 bg-emerald-400 rounded-full my-auto opacity-70" />
                  <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md absolute">
                    <MapPin size={12} />
                  </div>
                </div>
              ) : doc.svgThumbnail === 'signature' ? (
                <div className="w-full h-full p-2 flex items-center justify-center bg-white dark:bg-slate-950">
                  <svg className="w-full h-10 text-indigo-800 dark:text-indigo-300" viewBox="0 0 100 40">
                    <path
                      d="M10 25 Q 30 5, 45 25 T 70 15 T 90 30"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : doc.svgThumbnail === 'scale' ? (
                <div className="w-full h-full bg-charcoal text-emerald-400 font-mono flex flex-col items-center justify-center p-2">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest">Gross Wt</span>
                  <span className="text-sm font-black">12480 kg</span>
                </div>
              ) : doc.thumbnailUrl ? (
                <img
                  src={doc.thumbnailUrl}
                  alt={doc.type}
                  className="w-full h-full object-cover"
                />
              ) : (
                <FileCheck size={28} className="text-slate-400" />
              )}
            </div>

            {/* Sub-label & Date */}
            <div className="space-y-0.5 text-[10px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium block">
                {doc.subLabel}
              </span>
              <span className="text-slate-700 dark:text-slate-300 font-semibold font-mono block truncate">
                {doc.dateStr}
              </span>
            </div>

            {/* View Link */}
            <button
              type="button"
              onClick={() => onPreviewDoc?.(doc)}
              className="flex items-center justify-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 pt-1 border-t border-slate-200 dark:border-slate-800 cursor-pointer"
            >
              <Eye size={13} /> View
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
