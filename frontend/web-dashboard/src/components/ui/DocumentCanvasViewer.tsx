import { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, RefreshCw, FileText, Download, ExternalLink, Maximize2, X, Scaling, Expand } from 'lucide-react';
import { resolveFileUrl } from '@/lib/documents';
import { isImageFile, isPdfFile } from '@/components/ui/DocumentViewerModal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface DocumentFileItem {
  id?: string;
  file_url: string;
  mime_type?: string | null;
  label?: string | null;
}

interface DocumentCanvasViewerProps {
  files: DocumentFileItem[];
  title?: string;
  className?: string;
  canvasHeightClassName?: string;
  showActions?: boolean;
}

export default function DocumentCanvasViewer({
  files,
  title,
  className,
  canvasHeightClassName = 'h-full min-h-[480px]',
  showActions = true,
}: DocumentCanvasViewerProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<'contain' | 'width'>('contain');
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  const activeFile = files[activeIdx] || files[0];

  useEffect(() => {
    setActiveIdx(0);
    setZoomLevel(1);
    setRotation(0);
    setFitMode('contain');
    setHasError(false);
  }, [files]);

  useEffect(() => {
    setHasError(false);
  }, [activeIdx, retryKey]);

  if (!activeFile || !activeFile.file_url) {
    return (
      <div className={cn('rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-8 text-slate-400 text-center h-full w-full', className)}>
        <div className="space-y-2">
          <FileText className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">No document file preview available</p>
        </div>
      </div>
    );
  }

  const resolvedUrl = resolveFileUrl(activeFile.file_url);
  const isImg = isImageFile(activeFile.file_url, activeFile.mime_type);
  const isPdf = isPdfFile(activeFile.file_url, activeFile.mime_type);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 3.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const toggleFitMode = () => setFitMode((m) => (m === 'contain' ? 'width' : 'contain'));
  const handleReset = () => {
    setZoomLevel(1);
    setRotation(0);
    setFitMode('contain');
  };

  return (
    <div className={cn('flex flex-col space-y-2 h-full flex-1 min-h-0 w-full', className)}>
      {/* File Attachment Selector Tabs */}
      {files.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
          {files.map((file, idx) => (
            <button
              key={file.id || idx}
              type="button"
              onClick={() => {
                setActiveIdx(idx);
                handleReset();
              }}
              className={cn(
                'px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                activeIdx === idx
                  ? 'bg-[#FA634E] text-white border-[#FA634E] shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{file.label || `Page / File ${idx + 1}`}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Canvas Area */}
      <div className={cn('relative rounded-2xl overflow-hidden bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 flex-1 min-h-0 w-full flex items-center justify-center group', canvasHeightClassName)}>
        
        {/* Canvas Toolbar Controls Overlay */}
        {showActions && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm opacity-90 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              onClick={handleZoomIn}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              onClick={handleZoomOut}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              onClick={handleRotate}
              title="Rotate 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </Button>

            {isImg && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2 text-[10px] font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1",
                  fitMode === 'width' ? "bg-brand/10 text-brand font-black" : "text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                onClick={toggleFitMode}
                title={fitMode === 'contain' ? "Fit Width (for tall certificates)" : "Fit Container"}
              >
                <Expand className="w-3 h-3" />
                <span>{fitMode === 'contain' ? 'Fit Width' : 'Fit Page'}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              onClick={() => setIsFullscreenOpen(true)}
              title="Fullscreen Mode"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>

            {(zoomLevel !== 1 || rotation !== 0 || fitMode !== 'contain') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-[#FA634E] hover:bg-[#FA634E]/10 rounded-lg cursor-pointer transition-colors"
                onClick={handleReset}
              >
                Reset
              </Button>
            )}
            
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noreferrer"
              className="h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
              title="Open Raw File"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Render Image / PDF / Error */}
        {hasError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center gap-3 text-slate-400 max-w-xs">
            <FileText className="w-10 h-10 text-slate-500" />
            <div>
              <p className="text-xs font-bold text-slate-300">File Preview Unavailable</p>
              <p className="text-[11px] text-slate-500 mt-1">Unable to load document directly in viewer.</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs font-bold border-slate-700 text-slate-300 cursor-pointer"
                onClick={() => setRetryKey((k) => k + 1)}
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Retry
              </Button>
              <a
                href={resolvedUrl}
                download
                className="h-7 px-3 rounded-lg bg-[#FA634E] text-white text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-[#FA634E]/90"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          </div>
        ) : isImg ? (
          <div className={cn(
            "w-full h-full p-3 sm:p-5 overflow-auto flex scrollbar-thin",
            fitMode === 'width' ? "items-start justify-center" : "items-center justify-center"
          )}>
            <img
              key={`${resolvedUrl}-${retryKey}`}
              src={resolvedUrl}
              alt={title || 'Document Preview'}
              onError={() => setHasError(true)}
              style={{
                transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease-out',
                maxHeight: fitMode === 'width' ? 'none' : '100%',
                maxWidth: '100%',
                width: fitMode === 'width' ? '100%' : 'auto',
                objectFit: 'contain',
              }}
              className="rounded-xl shadow-lg border border-slate-200/60 dark:border-slate-800 bg-white m-auto"
            />
          </div>
        ) : isPdf ? (
          <iframe
            key={`${resolvedUrl}-${retryKey}`}
            src={`${resolvedUrl}#toolbar=0`}
            title={title || 'PDF Preview'}
            onError={() => setHasError(true)}
            className="w-full h-full border-0 rounded-2xl"
          />
        ) : (
          <iframe
            key={`${resolvedUrl}-${retryKey}`}
            src={resolvedUrl}
            title={title || 'Document Preview'}
            onError={() => setHasError(true)}
            className="w-full h-full border-0 rounded-2xl"
          />
        )}
      </div>

      {/* Fullscreen Preview Lightbox Modal */}
      {isFullscreenOpen && (
        <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 rounded-2xl overflow-hidden bg-charcoal-strong border-slate-800 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-charcoal border-b border-slate-800 text-white shrink-0">
              <span className="text-sm font-extrabold flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#FA634E]" />
                <span>{title || 'Document Preview (Fullscreen)'}</span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={resolvedUrl}
                  download
                  className="h-8 px-3 rounded-lg bg-[#FA634E] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#FA634E]/90 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                  onClick={() => setIsFullscreenOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6 flex items-center justify-center bg-charcoal-strong">
              {isImg ? (
                <img
                  src={resolvedUrl}
                  alt={title || 'Document Fullscreen'}
                  className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
                />
              ) : (
                <iframe
                  src={resolvedUrl}
                  title={title || 'Document Fullscreen'}
                  className="w-full h-full border-0 rounded-xl"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
