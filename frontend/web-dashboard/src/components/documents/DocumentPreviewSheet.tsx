import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Download, Trash2, ExternalLink, Sparkles, FolderOpen, Loader2, FileText, Hash, Building2,
  Calendar, Files as FilesIcon, RefreshCw, Clock, History, UploadCloud
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { documentService } from '@/services/documentService';
import { documentDisplayName, getExpiryStatus, formatBilingualAuthority, resolveFileUrl } from '@/lib/documents';
import { isImageFile, isPdfFile } from '@/components/ui/DocumentViewerModal';
import DocumentCanvasViewer from '@/components/ui/DocumentCanvasViewer';
import ImportReviewModal from '@/components/documents/ImportReviewModal';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

const STATUS_BADGE: Record<string, string> = {
  expired:  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400',
  critical: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400',
  warning:  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400',
  valid:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400',
  none:     'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
};
const STATUS_LABEL: Record<string, string> = {
  expired: 'Expired', critical: 'Expiring Soon', warning: 'Expiring Soon', valid: 'Valid', none: 'No Expiry',
};

interface DocumentPreviewSheetProps {
  documentId: string | null;
  onClose: () => void;
  /** Hide the "Open Folder" action when the sheet is already opened from inside that folder. */
  showOpenFolder?: boolean;
  onDeleted?: () => void;
}

export default function DocumentPreviewSheet({ documentId, onClose, showOpenFolder = true, onDeleted }: DocumentPreviewSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [isRescanning, setIsRescanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewRetryKey, setPreviewRetryKey] = useState(0);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState<boolean>(false);
  const addFileInputId = 'sheet-add-file-input';

  const { data: document, isLoading } = useQuery({
    queryKey: ['documents', 'detail', documentId],
    queryFn: () => documentService.getById(documentId!),
    enabled: !!documentId,
  });

  useEffect(() => setActiveFileIdx(0), [documentId]);
  useEffect(() => setPreviewError(false), [documentId, activeFileIdx, previewRetryKey]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['documents', 'detail', documentId] });
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const files = document?.files && document.files.length > 0
    ? document.files
    : document ? [{ id: 'primary', file_url: document.file_url, mime_type: document.mime_type, label: null }] : [];

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !document) return;
    try {
      toast.loading('Adding file...', { id: 'add-file' });
      await documentService.addFile(document.id, file);
      toast.success('File added', { id: 'add-file' });
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to add file', { id: 'add-file' });
    }
  };

  const handleRescan = async () => {
    if (!document) return;
    setIsRescanning(true);
    try {
      toast.loading('Re-scanning with AI Vision...', { id: 'rescan' });
      await documentService.extractDocumentOcr(document.id);
      toast.success('AI metadata updated', { id: 'rescan' });
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Re-scan failed', { id: 'rescan' });
    } finally {
      setIsRescanning(false);
    }
  };

  const handleDelete = async () => {
    if (!document) return;
    if (!confirm('Delete this document? It moves to Recently deleted, where you can restore it for 30 days.')) return;
    setIsDeleting(true);
    try {
      const id = document.id;
      await documentService.delete(id);
      toast.success('Moved to Recently deleted', {
        action: { label: 'Undo', onClick: async () => { await documentService.restore([id]); queryClient.invalidateQueries({ queryKey: ['documents'] }); } },
      });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      onDeleted?.();
      onClose();
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setIsDeleting(false);
    }
  };

  const expStatus = document ? getExpiryStatus(document.expiry_date) : 'none';
  const primaryUrl = files[0] ? resolveFileUrl(files[0].file_url) : '';

  return (
    <Sheet open={!!documentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading document...
          </div>
        ) : !document ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 text-sm p-6 text-center">
            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-1" />
            <p className="font-bold text-slate-700 dark:text-slate-200">Document Not Found</p>
            <p className="text-xs text-slate-400 max-w-xs">The requested document file could not be loaded or is not available.</p>
            <Button onClick={onClose} size="sm" variant="outline" className="mt-2 text-xs font-bold rounded-xl">Close</Button>
          </div>
        ) : (
          <>
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2 pr-8">
                <div>
                  <SheetTitle>{documentDisplayName(document)}</SheetTitle>
                  {files.length > 1 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {activeFileIdx + 1} of {files.length}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={cn('text-[10px] font-bold shrink-0', STATUS_BADGE[expStatus])}>
                  {STATUS_LABEL[expStatus]}
                </Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Document Canvas Viewer Component */}
              <DocumentCanvasViewer
                files={files}
                title={documentDisplayName(document)}
                canvasHeightClassName="h-60"
              />

              {/* Add File Hidden Input */}
              <input
                id={addFileInputId}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={handleAddFile}
              />

              {/* Document Information */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Document Information</h4>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <InfoRow label="Document Type" value={documentDisplayName(document)} />
                  <InfoRow label="Owner Type" value={document.entity_type} />
                  {document.ai_extracted_json?.document_number && (
                    <InfoRow label="Document Number" value={document.ai_extracted_json.document_number} mono />
                  )}
                  {document.issue_date && <InfoRow label="Issue Date" value={formatInDeploymentTz(document.issue_date, tz, 'dd/MM/yyyy')} />}
                  {document.expiry_date && <InfoRow label="Expiry Date" value={formatInDeploymentTz(document.expiry_date, tz, 'dd/MM/yyyy')} />}
                  {document.ai_extracted_json?.issuing_authority && (
                    <InfoRow label="Issuer" value={formatBilingualAuthority(document.ai_extracted_json.issuing_authority)} />
                  )}
                  <InfoRow label="Files" value={String(files.length)} />
                  <InfoRow label="Uploaded" value={formatInDeploymentTz(document.createdAt, tz, 'dd/MM/yyyy')} />
                </div>
              </div>

              {/* AI Extracted Information */}
              {document.ai_extracted_json && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> AI Extracted Information
                    </h4>
                    {typeof document.ai_extracted_json.confidence === 'number' && (
                      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {Math.round(document.ai_extracted_json.confidence * 100)}% Confidence
                      </span>
                    )}
                  </div>
                  <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 p-3 space-y-2 text-xs">
                    {document.ai_extracted_json.document_number && (
                      <AiField icon={Hash} label="Doc Number" value={document.ai_extracted_json.document_number} />
                    )}
                    {document.ai_extracted_json.vehicle_plate && (
                      <AiField icon={Building2} label="Plate" value={document.ai_extracted_json.vehicle_plate} />
                    )}
                    {document.ai_extracted_json.issuing_authority && (
                      <AiField icon={Building2} label="Authority" value={formatBilingualAuthority(document.ai_extracted_json.issuing_authority)} />
                    )}
                    {document.ai_extracted_json.notes && (
                      <p className="text-[11px] text-amber-900 dark:text-amber-300 italic pt-1 border-t border-amber-200/50">
                        "{document.ai_extracted_json.notes}"
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold gap-1.5 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 cursor-pointer"
                    onClick={handleRescan}
                    disabled={isRescanning}
                  >
                    {isRescanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Re-Scan with AI
                  </Button>
                </div>
              )}

              {/* Activity & History Timeline */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand" />
                    <span>Activity & Audit History</span>
                  </span>
                  <span className="text-[10px] text-slate-400">{showHistory ? 'Hide' : 'Show'}</span>
                </button>
                {showHistory && (
                  <div className="p-3 space-y-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">Document Record Uploaded</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {document.createdAt ? formatInDeploymentTz(document.createdAt, tz, 'MMM d, yyyy h:mm a') : 'Initial Creation'}
                        </p>
                      </div>
                    </div>
                    {document.ai_extracted_json && (
                      <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">AI Vision Metadata Extracted</p>
                          <p className="text-[10px] text-slate-400">Confidence: {Math.round((document.ai_extracted_json.confidence || 0.9) * 100)}%</p>
                        </div>
                      </div>
                    )}
                    {files.length > 1 && (
                      <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <FilesIcon className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">File Attachments Revision</p>
                          <p className="text-[10px] text-slate-400">{files.length} file attachments stored</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="text-xs font-bold gap-1.5 bg-brand hover:bg-brand-hover text-white cursor-pointer"
                  onClick={() => {
                    navigate(`/documents/doc/${document.id}`);
                    onClose();
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Full View
                </Button>
                {showOpenFolder && document.entity_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs font-bold gap-1.5 border-slate-200 dark:border-slate-700 cursor-pointer"
                    onClick={() => {
                      navigate(`/${document.entity_type === 'Driver' ? 'drivers' : 'vehicles'}/${document.entity_id}/documents`);
                      onClose();
                    }}
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> Open Folder
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={primaryUrl}
                  download
                  className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-bold gap-1.5 border-slate-200 text-slate-750 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-850 cursor-pointer"
                  onClick={() => setIsReplaceModalOpen(true)}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Replace
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-bold gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/40 cursor-pointer"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
                </Button>
              </div>
            </div>
          </>
        )}

        {isReplaceModalOpen && document && (
          <ImportReviewModal
            isOpen={isReplaceModalOpen}
            onClose={() => setIsReplaceModalOpen(false)}
            lockOwnerType={document.entity_type as any}
            lockOwnerId={document.entity_id}
            onImported={() => {
              queryClient.invalidateQueries({ queryKey: ['documents'] });
              setIsReplaceModalOpen(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={cn('font-bold text-slate-900 dark:text-slate-100 text-right', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

function AiField({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div>
        <span className="text-[10px] font-bold text-amber-800/70 dark:text-amber-400/80 block uppercase">{label}</span>
        <span className="font-mono font-extrabold text-amber-950 dark:text-amber-200">{value}</span>
      </div>
    </div>
  );
}
