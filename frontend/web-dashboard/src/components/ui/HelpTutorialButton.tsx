import React, { useState } from 'react';
import { HelpCircle, PlayCircle, Clock, Check, X, ChevronRight, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Btn from '@/components/ui/Btn';
import { learningService, type LearningResource, type TimestampedStep } from '@/services/learningService';

interface HelpTutorialButtonProps {
  route?: string;
  title?: string;
  className?: string;
}

export default function HelpTutorialButton({ route = '/trips', title = 'Page Help & Tutorial', className = '' }: HelpTutorialButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<LearningResource | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);

  const { data: routeVideos = [], isLoading } = useQuery({
    queryKey: ['learning-by-route', route],
    queryFn: () => learningService.getByRoute(route),
    enabled: isOpen,
  });

  const displayVideo = activeVideo || (routeVideos.length > 0 ? routeVideos[0] : null);

  function formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 hover:text-[#FA634E] shadow-xs transition-all ${className}`}
        title={`${title} - Click for video guide`}
      >
        <HelpCircle className="w-4.5 h-4.5 text-[#FA634E]" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading page tutorial...</div>
          ) : displayVideo ? (
            <div className="flex flex-col">
              {/* Media Player */}
              <div className="bg-charcoal-strong aspect-video w-full flex items-center justify-center relative">
                {displayVideo.videoUrl.endsWith('.mp4') || displayVideo.videoUrl.endsWith('.webm') || displayVideo.videoUrl.startsWith('/uploads/') ? (
                  <video
                    src={displayVideo.videoUrl}
                    controls
                    autoPlay
                    className="w-full h-full max-h-[420px] object-contain"
                  />
                ) : (
                  <iframe
                    src={displayVideo.videoUrl}
                    title={displayVideo.title}
                    className="w-full h-full min-h-[320px]"
                    allowFullScreen
                  />
                )}
              </div>

              {/* Video Info */}
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {displayVideo.categoryLabel || displayVideo.category}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900 mt-1">{displayVideo.title}</h2>
                  </div>
                  <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5" /> {formatDuration(displayVideo.durationSeconds)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{displayVideo.description}</p>

                {/* Steps */}
                {displayVideo.steps && Array.isArray(displayVideo.steps) && displayVideo.steps.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      <ChevronRight className="w-3.5 h-3.5 text-[#FA634E]" /> Timestamped Steps
                    </h4>
                    <div className="space-y-1.5">
                      {displayVideo.steps.map((step: TimestampedStep, idx: number) => (
                        <div
                          key={idx}
                          onClick={() => setActiveStepIdx(idx)}
                          className={`p-2.5 rounded border text-xs cursor-pointer flex items-start gap-2 transition-colors ${
                            activeStepIdx === idx ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-mono font-bold text-slate-700 border border-slate-200">
                            {step.time}
                          </span>
                          <div>
                            <span className="font-semibold text-slate-800">{step.title}</span>
                            <p className="text-slate-500 text-[11px] mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center space-y-3">
              <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No Video Tutorial Attached Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                SuperAdmins can upload a tutorial video for route <code className="bg-slate-100 px-1 rounded">{route}</code> from the MERCON Learning Hub.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
