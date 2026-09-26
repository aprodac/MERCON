import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Video,
  CheckCircle2,
  PlayCircle,
  Search,
  Clock,
  Check,
  Plus,
  Trash2,
  Sparkles,
  ChevronRight,
  Calculator,
  Truck,
  Wrench,
  Smartphone,
  FolderOpen,
  Upload,
  X,
  FileVideo,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import Btn from '@/components/ui/Btn';
import KpiCard from '@/components/ui/KpiCard';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { authStore } from '@/store/authStore';
import { learningService, type LearningResource, type TimestampedStep } from '@/services/learningService';

const CATEGORY_ICON_MAP: Record<string, any> = {
  dispatch: Truck,
  payouts: Calculator,
  quotations: FolderOpen,
  fleet: Wrench,
  mobile: Smartphone,
};

const CATEGORY_LABEL_MAP: Record<string, string> = {
  dispatch: 'Dispatch & Trips',
  payouts: 'Driver Payouts',
  quotations: 'Quotations & Rates',
  fleet: 'Fleet & Maint.',
  mobile: 'Mobile & POD',
};

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function LearningPage() {
  const queryClient = useQueryClient();
  const user = authStore.getUser();
  const canManage = user?.role === 'Admin' || user?.role === 'SuperAdmin' || (user as any)?.isSuperAdmin;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeVideo, setActiveVideo] = useState<LearningResource | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('dispatch');
  const [categoryLabel, setCategoryLabel] = useState('Dispatch & Trips');
  const [description, setDescription] = useState('');
  const [durationMins, setDurationMins] = useState('3');
  const [durationSecs, setDurationSecs] = useState('30');
  const [directVideoUrl, setDirectVideoUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [stepInput, setStepInput] = useState<{ time: string; title: string; description: string }>({
    time: '00:00',
    title: '',
    description: '',
  });
  const [stepsList, setStepsList] = useState<TimestampedStep[]>([]);
  const [takeawayInput, setTakeawayInput] = useState('');
  const [takeawaysList, setTakeawaysList] = useState<string[]>([]);

  // Delete modal state
  const [deletingResource, setDeletingResource] = useState<LearningResource | null>(null);

  // Query resources
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['learning-resources'],
    queryFn: learningService.getResources,
  });

  // Watch mutation
  const watchMutation = useMutation({
    mutationFn: (id: string) => learningService.toggleWatched(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['learning-resources'] });
      if (activeVideo && activeVideo.id === id) {
        setActiveVideo({ ...activeVideo, isWatched: data.watched });
      }
      toast.success(data.watched ? 'Marked as completed' : 'Marked as uncompleted');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to update watch status');
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      learningService.uploadResource(formData, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      }),
    onSuccess: () => {
      toast.success('Learning video published successfully');
      queryClient.invalidateQueries({ queryKey: ['learning-resources'] });
      closeUploadModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to upload video resource');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => learningService.deleteResource(id),
    onSuccess: () => {
      toast.success('Learning resource deleted');
      queryClient.invalidateQueries({ queryKey: ['learning-resources'] });
      setDeletingResource(null);
      if (activeVideo && activeVideo.id === deletingResource?.id) {
        setActiveVideo(null);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete resource');
    },
  });

  // Metrics
  const watchedCount = useMemo(() => resources.filter((r) => r.isWatched).length, [resources]);
  const completionPercent = useMemo(() => {
    if (!resources.length) return 0;
    return Math.round((watchedCount / resources.length) * 100);
  }, [resources, watchedCount]);

  // Categories list
  const categories = useMemo(() => {
    const cats: { key: string; label: string; count: number; icon: any }[] = [
      { key: 'all', label: 'All Courses', count: resources.length, icon: BookOpen },
    ];
    const unique = Array.from(new Set(resources.map((r) => r.category)));
    unique.forEach((catKey) => {
      const count = resources.filter((r) => r.category === catKey).length;
      cats.push({
        key: catKey,
        label: CATEGORY_LABEL_MAP[catKey] || catKey.toUpperCase(),
        count,
        icon: CATEGORY_ICON_MAP[catKey] || Video,
      });
    });
    return cats;
  }, [resources]);

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchesCat = selectedCategory === 'all' || r.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.categoryLabel && r.categoryLabel.toLowerCase().includes(q)) ||
        (r.steps && r.steps.some((s: TimestampedStep) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)));
      return matchesCat && matchesQuery;
    });
  }, [resources, selectedCategory, searchQuery]);

  const closeUploadModal = () => {
    setIsUploadOpen(false);
    setFile(null);
    setTitle('');
    setCategory('dispatch');
    setCategoryLabel('Dispatch & Trips');
    setDescription('');
    setDurationMins('3');
    setDurationSecs('30');
    setDirectVideoUrl('');
    setUploadProgress(0);
    setStepsList([]);
    setTakeawaysList([]);
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    setCategoryLabel(CATEGORY_LABEL_MAP[val] || val);
  };

  const handleAddStep = () => {
    if (!stepInput.title.trim()) return;
    setStepsList([...stepsList, { ...stepInput }]);
    setStepInput({ time: '01:00', title: '', description: '' });
  };

  const handleAddTakeaway = () => {
    if (!takeawayInput.trim()) return;
    setTakeawaysList([...takeawaysList, takeawayInput.trim()]);
    setTakeawayInput('');
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in title and description');
      return;
    }
    if (!file && !directVideoUrl.trim()) {
      toast.error('Please select a video file or provide a video URL');
      return;
    }

    const totalSecs = (parseInt(durationMins, 10) || 0) * 60 + (parseInt(durationSecs, 10) || 0);

    const formData = new FormData();
    if (file) {
      formData.append('video', file);
    } else if (directVideoUrl.trim()) {
      formData.append('videoUrl', directVideoUrl.trim());
    }
    formData.append('title', title.trim());
    formData.append('category', category);
    formData.append('categoryLabel', categoryLabel);
    formData.append('description', description.trim());
    formData.append('durationSeconds', String(totalSecs));
    if (stepsList.length > 0) {
      formData.append('steps', JSON.stringify(stepsList));
    }
    if (takeawaysList.length > 0) {
      formData.append('keyTakeaways', JSON.stringify(takeawaysList));
    }

    uploadMutation.mutate(formData);
  };

  return (
    <DashboardLayout active="learning" title="Learning Hub">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#3E3C3D]">MERCON Learning Hub</h1>
            <p className="text-sm text-slate-500 mt-1">
              Operational video tutorials, driver payout rules, and system guides
            </p>
          </div>
          {canManage && (
            <div>
              <Btn
                label="Upload Video"
                icon={<Plus className="w-4 h-4" />}
                variant="primary"
                onClick={() => setIsUploadOpen(true)}
              />
            </div>
          )}
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            title="Total Courses"
            value={resources.length}
            icon={<BookOpen className="w-5 h-5 text-slate-600" />}
            description="Available video tutorials"
            variant="slate"
          />
          <KpiCard
            title="Completed"
            value={watchedCount}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            description={`${completionPercent}% module completion`}
            variant="emerald"
          />
          <KpiCard
            title="Learning Progress"
            value={`${completionPercent}%`}
            completionGauge={{ percentage: completionPercent, label: 'Completion' }}
            variant="brand"
          />
        </div>

        {/* Filter Bar & Category Pills */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search tutorials, routes, rates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200 text-sm"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-semibold text-slate-800">{filteredResources.length}</span> of {resources.length} courses
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => {
              const IconComp = cat.icon;
              const isActive = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-[#3E3C3D] text-white border-[#3E3C3D] shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Video Tutorial Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-slate-100 animate-pulse rounded-lg border border-slate-200" />
            ))}
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center space-y-3">
            <Video className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">No tutorials found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No learning videos match your search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResources.map((resource) => (
              <div
                key={resource.id}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-lg overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                {/* Thumbnail / Header Banner */}
                <div
                  className="h-36 bg-charcoal relative p-4 flex flex-col justify-between cursor-pointer"
                  onClick={() => {
                    setActiveVideo(resource);
                    setActiveStepIdx(0);
                  }}
                >
                  <div className="flex items-center justify-between z-10">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-charcoal-strong/40 text-white backdrop-blur-xs">
                      {resource.categoryLabel || resource.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-charcoal-strong/40 text-white backdrop-blur-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(resource.durationSeconds)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center my-auto z-10 group-hover:scale-110 transition-transform">
                    <div className="w-12 h-12 rounded-full bg-[#FA634E] text-white flex items-center justify-center shadow-lg">
                      <PlayCircle className="w-7 h-7 fill-white/20" />
                    </div>
                  </div>

                  {resource.isWatched && (
                    <div className="absolute bottom-2 right-2 bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-xs z-10">
                      <Check className="w-3 h-3" /> Watched
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3
                      className="font-bold text-slate-800 text-sm line-clamp-2 hover:text-[#FA634E] cursor-pointer transition-colors"
                      onClick={() => {
                        setActiveVideo(resource);
                        setActiveStepIdx(0);
                      }}
                    >
                      {resource.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                      {resource.description}
                    </p>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Btn
                      label="Watch Video"
                      icon={<PlayCircle className="w-3.5 h-3.5" />}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setActiveVideo(resource);
                        setActiveStepIdx(0);
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <Btn
                        label={resource.isWatched ? 'Watched' : 'Mark Watched'}
                        icon={<Check className="w-3.5 h-3.5" />}
                        variant={resource.isWatched ? 'success' : 'ghost'}
                        size="sm"
                        onClick={() => watchMutation.mutate(resource.id)}
                      />
                      {canManage && (
                        <Btn
                          label=""
                          icon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingResource(resource)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video Player Modal */}
        <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            {activeVideo && (
              <div className="flex flex-col">
                {/* Media Container */}
                <div className="bg-charcoal-strong aspect-video w-full flex items-center justify-center relative">
                  {activeVideo.videoUrl.endsWith('.mp4') || activeVideo.videoUrl.endsWith('.webm') || activeVideo.videoUrl.startsWith('/uploads/') ? (
                    <video
                      src={activeVideo.videoUrl}
                      controls
                      autoPlay
                      className="w-full h-full max-h-[480px] object-contain"
                    />
                  ) : (
                    <iframe
                      src={activeVideo.videoUrl}
                      title={activeVideo.title}
                      className="w-full h-full min-h-[360px]"
                      allowFullScreen
                    />
                  )}
                </div>

                {/* Details Section */}
                <div className="p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                          {activeVideo.categoryLabel || activeVideo.category}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(activeVideo.durationSeconds)}
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">{activeVideo.title}</h2>
                    </div>

                    <Btn
                      label={activeVideo.isWatched ? 'Completed' : 'Mark as Watched'}
                      icon={<Check className="w-4 h-4" />}
                      variant={activeVideo.isWatched ? 'success' : 'primary'}
                      onClick={() => watchMutation.mutate(activeVideo.id)}
                    />
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">{activeVideo.description}</p>

                  {/* Steps Breakdown */}
                  {activeVideo.steps && Array.isArray(activeVideo.steps) && activeVideo.steps.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <ChevronRight className="w-4 h-4 text-[#FA634E]" /> Timestamped Lesson Steps
                      </h3>
                      <div className="space-y-2">
                        {activeVideo.steps.map((step: TimestampedStep, idx: number) => (
                          <div
                            key={idx}
                            onClick={() => setActiveStepIdx(idx)}
                            className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3 ${
                              activeStepIdx === idx
                                ? 'bg-orange-50/50 border-orange-200'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className="px-2 py-0.5 rounded bg-white text-xs font-mono font-bold text-slate-700 border border-slate-200">
                              {step.time}
                            </span>
                            <div className="flex-1">
                              <h4 className="text-xs font-bold text-slate-800">{step.title}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Takeaways */}
                  {activeVideo.keyTakeaways && Array.isArray(activeVideo.keyTakeaways) && activeVideo.keyTakeaways.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" /> Key Takeaways
                      </h3>
                      <ul className="space-y-2 bg-amber-50/40 border border-amber-200/70 p-4 rounded-lg">
                        {activeVideo.keyTakeaways.map((point: string, idx: number) => (
                          <li key={idx} className="text-xs text-amber-900 flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Upload Video Modal */}
        <Dialog open={isUploadOpen} onOpenChange={(open) => !open && closeUploadModal()}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">Upload Learning Video</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleUploadSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Video File (MP4, WEBM, MOV up to 500MB)</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <FileVideo className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                  {file ? (
                    <p className="text-xs font-bold text-emerald-700">{file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)</p>
                  ) : (
                    <p className="text-xs text-slate-500">Drag & drop video file here or click to browse</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Course Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. How to Dispatch a Multi-Stop Trip"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Category</Label>
                  <Select value={category} onValueChange={handleCategoryChange}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dispatch">Dispatch & Trips</SelectItem>
                      <SelectItem value="payouts">Driver Payouts</SelectItem>
                      <SelectItem value="quotations">Quotations & Rates</SelectItem>
                      <SelectItem value="fleet">Fleet & Maintenance</SelectItem>
                      <SelectItem value="mobile">Mobile & POD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Duration (Minutes : Seconds)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={durationMins}
                      onChange={(e) => setDurationMins(e.target.value)}
                      placeholder="Mins"
                    />
                    <span className="text-xs font-bold text-slate-400">:</span>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={durationSecs}
                      onChange={(e) => setDurationSecs(e.target.value)}
                      placeholder="Secs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Description *</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of what operators will learn from this video..."
                  rows={3}
                  required
                />
              </div>

              {/* Optional Steps Builder */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <Label className="text-xs font-semibold text-slate-700">Add Timestamped Steps (Optional)</Label>
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    placeholder="00:45"
                    value={stepInput.time}
                    onChange={(e) => setStepInput({ ...stepInput, time: e.target.value })}
                  />
                  <Input
                    placeholder="Step Title"
                    className="col-span-3"
                    value={stepInput.title}
                    onChange={(e) => setStepInput({ ...stepInput, title: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Step Description"
                    className="flex-1"
                    value={stepInput.description}
                    onChange={(e) => setStepInput({ ...stepInput, description: e.target.value })}
                  />
                  <Btn label="Add" variant="secondary" size="sm" type="button" onClick={handleAddStep} />
                </div>

                {stepsList.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {stepsList.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
                        <span><strong className="font-mono">{s.time}</strong> — {s.title}</span>
                        <button type="button" onClick={() => setStepsList(stepsList.filter((_, i) => i !== idx))}>
                          <X className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload Progress Bar */}
              {uploadMutation.isPending && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Uploading file...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#FA634E] h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Btn label="Cancel" variant="secondary" type="button" onClick={closeUploadModal} />
                <Btn
                  label={uploadMutation.isPending ? 'Uploading...' : 'Publish Video'}
                  icon={<Upload className="w-4 h-4" />}
                  variant="primary"
                  type="submit"
                  isLoading={uploadMutation.isPending}
                />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        {deletingResource && (
          <ConfirmModal
            isOpen={!!deletingResource}
            onClose={() => setDeletingResource(null)}
            onConfirm={() => deleteMutation.mutate(deletingResource.id)}
            title="Delete Learning Video"
            message={`Are you sure you want to delete "${deletingResource.title}"? This cannot be undone.`}
            confirmLabel="Delete Video"
            isDestructive={true}
            isLoading={deleteMutation.isPending}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
