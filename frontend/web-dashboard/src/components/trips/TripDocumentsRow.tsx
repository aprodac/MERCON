import React, { useState } from 'react';
import { Paperclip, UploadCloud, CheckCircle2, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatInDeploymentTz } from '@/lib/datetime';

interface TripDocumentsRowProps {
  documents: any[];
  onUploadClick: () => void;
  onPreview: (img: { url: string; title: string; date?: string }) => void;
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

const DEFAULT_DOC_SLOTS = [
  {
    id: 'origin',
    title: '1. Origin Photo',
    count: 1,
    time: '02 Sep, 08:40 PM',
    status: 'Uploaded',
    sampleImg: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80',
    types: ['ORIGIN', 'PICKUP'],
  },
  {
    id: 'reached',
    title: '2. Reached at Pickup',
    count: 1,
    time: '02 Sep, 09:10 PM',
    status: 'Uploaded',
    sampleImg: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=300&auto=format&fit=crop&q=80',
    types: ['REACHED', 'ARRIVAL'],
  },
  {
    id: 'loading',
    title: '3. Loading Image',
    count: 2,
    time: '02 Sep, 09:25 PM',
    status: 'Uploaded',
    sampleImg: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=300&auto=format&fit=crop&q=80',
    types: ['LOAD', 'CARGO', 'LOADING'],
  },
  {
    id: 'pod',
    title: '4. Proof of Delivery (POD)',
    count: 1,
    time: '03 Sep, 08:20 AM',
    status: 'Uploaded',
    sampleImg: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=300&auto=format&fit=crop&q=80',
    types: ['POD', 'WAYBILL', 'RECEIPT'],
  },
  {
    id: 'delivered',
    title: '5. Delivered Photo',
    count: 1,
    time: '03 Sep, 08:22 AM',
    status: 'Uploaded',
    sampleImg: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=300&auto=format&fit=crop&q=80',
    types: ['DELIVERY', 'DELIVERED'],
  },
];

export default function TripDocumentsRow({
  documents,
  onUploadClick,
  onPreview,
}: TripDocumentsRowProps) {
  // Bind real uploaded files if they match keywords, else fallback to slots
  const totalCount = Math.max(documents.length, 5);

  return (
    <div className="w-full bg-white rounded-2xl border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3 flex flex-col justify-between shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB] shrink-0">
        <div className="flex items-center gap-1.5">
          <Paperclip size={15} className="text-[#4B5563] rotate-45" />
          <h3 className="text-xs font-bold text-[#1F2937]">
            Trip Documents <span className="font-normal text-[#6B7280]">({totalCount})</span>
          </h3>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onUploadClick}
          className="h-7 px-2.5 rounded-lg border-[#FA634E] text-[#FA634E] hover:bg-rose-50 hover:text-[#e0523d] text-[11px] font-bold gap-1 shadow-none cursor-pointer"
        >
          <UploadCloud size={13} />
          Upload Document
        </Button>
      </div>

      {/* 5 Horizontal Cards */}
      <div className="grid grid-cols-5 gap-2.5 pt-2.5">
        {DEFAULT_DOC_SLOTS.map((slot, idx) => {
          // Check if any real uploaded doc matches this slot
          const matchedRealDoc = documents.find((d) => {
            const name = (d.name || d.doc_type || d.documentType?.name || '').toUpperCase();
            return slot.types.some((t) => name.includes(t));
          }) || (documents[idx] || null);

          const displayImg = matchedRealDoc?.file_url
            ? resolveFileUrl(matchedRealDoc.file_url)
            : slot.sampleImg;

          const displayCount = matchedRealDoc ? 1 : slot.count;
          const displayTime = matchedRealDoc?.createdAt
            ? formatInDeploymentTz(matchedRealDoc.createdAt, 'Asia/Riyadh', 'dd MMM, hh:mm a')
            : slot.time;

          return (
            <div
              key={slot.id}
              onClick={() =>
                onPreview({
                  url: displayImg,
                  title: slot.title,
                  date: displayTime,
                })
              }
              className="group relative bg-[#FAF9F6]/40 border border-[#E5E7EB] hover:border-slate-300 rounded-xl p-1.5 flex flex-col cursor-pointer transition-all hover:shadow-sm"
            >
              {/* Thumbnail Container */}
              <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0">
                <img
                  src={displayImg}
                  alt={slot.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Count Badge in top-right */}
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/95 backdrop-blur-xs text-[#1F2937] font-bold text-[10px] flex items-center justify-center shadow-sm border border-[#E5E7EB]">
                  {displayCount}
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-charcoal-strong/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Eye size={15} />
                </div>
              </div>

              {/* Card Meta */}
              <div className="pt-1.5 px-0.5 space-y-0.5">
                <p className="text-[10.5px] font-bold text-[#1F2937] truncate leading-tight" title={slot.title}>
                  {slot.title}
                </p>

                <div className="flex items-center gap-1 text-[9.5px] font-semibold text-emerald-600 leading-none">
                  <CheckCircle2 size={11} className="fill-emerald-600 text-white" />
                  <span>{slot.status}</span>
                </div>

                <p className="text-[9px] font-mono text-[#6B7280] truncate leading-none">
                  {displayTime}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
