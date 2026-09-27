import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ZoomOut,
  RotateCw,
  RotateCcw,
  Check,
  RefreshCw,
  Crop,
} from 'lucide-react';

interface ProfileCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string | null;
  onCropComplete: (croppedDataUrl: string) => void;
}

export default function ProfileCropModal({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
}: ProfileCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Load image object whenever imageSrc changes
  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setImageObj(img);
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
      };
      img.src = imageSrc;
    } else {
      setImageObj(null);
    }
  }, [imageSrc]);

  // Draw image on canvas preview
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 300; // Preview size
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    if (imageObj) {
      ctx.save();
      // Move to center
      ctx.translate(size / 2 + offset.x, size / 2 + offset.y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      const aspect = imageObj.width / imageObj.height;
      let drawW = size;
      let drawH = size;
      if (aspect > 1) {
        drawH = size / aspect;
      } else {
        drawW = size * aspect;
      }

      ctx.drawImage(imageObj, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    // Overlay mask (darken outside circle)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(size / 2, size / 2, 120, 0, Math.PI * 2, true);
    ctx.fill();

    // Circle border guide
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

  }, [isOpen, imageObj, zoom, rotation, offset]);

  // Mouse event handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleRotate = (direction: 'cw' | 'ccw') => {
    setRotation((prev) => (direction === 'cw' ? (prev + 90) % 360 : (prev - 90 + 360) % 360));
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handleCropAndSave = () => {
    if (!imageObj) return;

    // High res export canvas (400x400)
    const exportSize = 400;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportSize;
    exportCanvas.height = exportSize;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Scale factor from preview (300) to export (400)
    const scaleFactor = exportSize / 300;

    // Circle mask clipping
    ctx.beginPath();
    ctx.arc(exportSize / 2, exportSize / 2, exportSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.save();
    ctx.translate(
      exportSize / 2 + offset.x * scaleFactor,
      exportSize / 2 + offset.y * scaleFactor
    );
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const aspect = imageObj.width / imageObj.height;
    let drawW = exportSize;
    let drawH = exportSize;
    if (aspect > 1) {
      drawH = exportSize / aspect;
    } else {
      drawW = exportSize * aspect;
    }

    ctx.drawImage(imageObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const croppedDataUrl = exportCanvas.toDataURL('image/png', 0.95);
    onCropComplete(croppedDataUrl);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-brand shrink-0" />
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                Adjust & Crop Profile Photo
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                Drag to reposition, use zoom and rotation to frame the driver avatar.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center space-y-4 py-3">
          {/* Canvas Area */}
          <div className="relative group cursor-grab active:cursor-grabbing rounded-2xl overflow-hidden shadow-inner border border-slate-700/50 bg-charcoal-strong">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="touch-none select-none rounded-xl"
            />
            <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center pointer-events-none px-2 py-1 bg-charcoal-strong/40 backdrop-blur-xs rounded-md text-[10px] text-slate-300 font-mono">
              <span>Zoom: {zoom.toFixed(2)}x</span>
              <span>Rotation: {rotation}°</span>
            </div>
          </div>

          {/* Controls */}
          <div className="w-full space-y-3 px-2">
            {/* Zoom Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ZoomOut className="w-3.5 h-3.5 text-slate-400" /> Scale & Zoom
                </span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            {/* Rotation & Quick Action Buttons */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRotate('ccw')}
                  className="h-8 px-2.5 text-xs gap-1 border-slate-200 dark:border-slate-800"
                  title="Rotate Left 90°"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> -90°
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRotate('cw')}
                  className="h-8 px-2.5 text-xs gap-1 border-slate-200 dark:border-slate-800"
                  title="Rotate Right 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" /> +90°
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 px-2 text-xs gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleCropAndSave}
            disabled={!imageObj}
            className="h-9 text-xs gap-1.5 bg-brand hover:bg-brand/90 text-white font-semibold px-4"
          >
            <Check className="w-3.5 h-3.5" /> Apply Cropped Photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
