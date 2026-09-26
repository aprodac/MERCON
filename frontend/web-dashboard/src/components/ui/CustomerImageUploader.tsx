import React, { useRef, useState } from 'react';
import { UploadCloud, X, Camera, Crop, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProfileCropModal from './ProfileCropModal';
import { cn } from '@/lib/utils';

interface CustomerImageUploaderProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  companyName?: string;
  className?: string;
}

export default function CustomerImageUploader({
  value,
  onChange,
  companyName = '',
  className,
}: CustomerImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);

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
        setPendingImage(reader.result);
        setIsCropOpen(true);
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

  const handleOpenExistingForCrop = () => {
    if (value) {
      setPendingImage(value);
      setIsCropOpen(true);
    }
  };

  const initials = companyName
    ? companyName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'CO';

  return (
    <>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col sm:flex-row items-center gap-3.5 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 transition-all hover:border-brand/50',
          className
        )}
      >
        {/* Logo Display Container */}
        <div className="relative group shrink-0">
          <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shadow-2xs">
            {value ? (
              <img src={value} alt={companyName || 'Company Logo'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-brand flex flex-col items-center justify-center text-white font-bold text-sm">
                <span>{initials}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 rounded-xl bg-charcoal-strong/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
            title="Upload or Change company logo"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-brand" /> Company Logo / Brand Avatar
            </span>
            {value && (
              <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                Logo Active
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            Upload company logo for invoices & manifest documents. PNG, JPG or WEBP (Max 8MB).
          </p>

          <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
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
              className="h-7 text-[11px] gap-1 font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs hover:border-brand"
            >
              <UploadCloud className="w-3 h-3 text-brand" /> Upload Logo
            </Button>

            {value && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenExistingForCrop}
                  className="h-7 text-[11px] gap-1 font-semibold text-brand bg-orange-50/50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/40 hover:bg-orange-100"
                >
                  <Crop className="w-3 h-3" /> Crop & Refine
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(null)}
                  className="h-7 text-[11px] gap-1 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <X className="w-3 h-3" /> Remove
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <ProfileCropModal
        isOpen={isCropOpen}
        onClose={() => setIsCropOpen(false)}
        imageSrc={pendingImage}
        onCropComplete={(croppedUrl) => onChange(croppedUrl)}
      />
    </>
  );
}
