import React, { useRef, useState } from 'react';
import { UploadCloud, X, Camera, Crop, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DriverAvatar from './DriverAvatar';
import ProfileCropModal from './ProfileCropModal';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';


interface DriverImageUploaderProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  firstName?: string;
  lastName?: string;
  className?: string;
}

export default function DriverImageUploader({
  value,
  onChange,
  firstName = '',
  lastName = '',
  className,
}: DriverImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadCroppedImage = async (croppedDataUrl: string) => {
    setIsUploading(true);
    try {
      // Convert base64 to Blob
      const res = await fetch(croppedDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `avatar-${Date.now()}.png`, { type: 'image/png' });

      // Upload via existing /api/upload endpoint
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data?.success && response.data?.data?.file_url) {
        onChange(response.data.data.file_url);
      } else {
        alert('Failed to upload image. Please try again.');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Network error while uploading the image. Please try again.');
    } finally {
      setIsUploading(false);
      setIsCropOpen(false);
    }
  };

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
      // Reset input so re-selecting same file works
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

  return (
    <>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 transition-all hover:border-indigo-300 dark:hover:border-indigo-800',
          className
        )}
      >
        <div className="relative group shrink-0">
          <DriverAvatar src={value} firstName={firstName} lastName={lastName} size="xl" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-charcoal-strong/45 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
            title="Upload or Change photo"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Driver Profile Photo
            </span>
            {value && (
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                Photo Set
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Upload and crop a clear headshot. PNG, JPG or WEBP (Max 8MB).
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
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
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="h-8 text-xs gap-1.5 font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-300"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} 
              {isUploading ? 'Uploading...' : 'Upload Image'}
            </Button>

            {value && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={handleOpenExistingForCrop}
                  className="h-8 text-xs gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
                >
                  <Crop className="w-3.5 h-3.5" /> Crop & Refine
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(null)}
                  className="h-8 text-xs gap-1 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <X className="w-3.5 h-3.5" /> Remove
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
        onCropComplete={handleUploadCroppedImage}
      />
    </>
  );
}

