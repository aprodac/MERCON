import React, { useRef } from 'react';
import { UploadCloud, X, Camera, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VehicleImageUploaderProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  plateNumber?: string;
  className?: string;
}

export default function VehicleImageUploader({
  value,
  onChange,
  plateNumber = '',
  className,
}: VehicleImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('Image file size must be less than 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Direct set — NO crop popup modal
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 transition-all hover:border-brand/60',
        className
      )}
    >
      {/* Square Preview Box (1:1 Square) */}
      <div className="relative group shrink-0 w-24 h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center shadow-xs">
        {value ? (
          <img
            src={value}
            alt={plateNumber || 'Vehicle Profile'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
            <Truck className="w-8 h-8 text-slate-400" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">No Photo</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute inset-0 bg-charcoal-strong/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md text-xs font-semibold gap-1"
          title="Upload or Change vehicle photo"
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px]">Change</span>
        </button>
      </div>

      {/* Action Controls */}
      <div className="flex-1 text-center sm:text-left space-y-1">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Vehicle Profile Picture
          </span>
          {value && (
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              Picture Set
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Upload photo directly (PNG, JPG or WEBP, Max 8MB). No crop modal required.
        </p>

        <div className="pt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs gap-1.5 font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:border-brand"
          >
            <UploadCloud className="w-3.5 h-3.5" /> Upload Photo
          </Button>

          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              className="h-8 text-xs gap-1 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <X className="w-3.5 h-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
