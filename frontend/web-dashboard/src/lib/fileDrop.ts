/**
 * File & folder picking for document uploads — shared by the upload modal and
 * the AI import review so both accept the same files the same way.
 */

/** Extensions the API accepts (mirrors backend `uploadFileFilter.ts`). */
export const DOC_UPLOAD_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.tiff', '.bmp',
  '.doc', '.docx', '.xls', '.xlsx', '.txt', '.rtf', '.csv',
];

export const DOC_UPLOAD_ACCEPT = DOC_UPLOAD_EXTENSIONS.join(',');

/** Per-file cap enforced by multer on the API. */
export const MAX_DOC_FILE_BYTES = 150 * 1024 * 1024;

const SYSTEM_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', 'icon\r']);

/**
 * Where a file sat inside a picked/dropped folder ("Truck 12/Isthimara.pdf").
 * Folder-input picks expose `webkitRelativePath`; drag-and-drop does not, so
 * dropped files are recorded here as they are read.
 */
const droppedPaths = new WeakMap<File, string>();

export function relativePathOf(file: File): string {
  return droppedPaths.get(file) || (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

/** True when the file came out of a folder rather than being picked on its own. */
export function isFromFolder(file: File): boolean {
  return relativePathOf(file).includes('/');
}

/** Folder part of a file's relative path ('' for loose files). */
export function folderOf(file: File): string {
  const p = relativePathOf(file);
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '';
}

export function fileKey(file: File): string {
  return `${relativePathOf(file)}::${file.size}::${file.lastModified}`;
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

/**
 * Splits picked files into ones the API will take and ones it would reject,
 * so a stray .zip or .DS_Store in a folder doesn't fail the whole upload.
 * Hidden/system files are dropped silently.
 */
export function partitionUploadable(files: File[]): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (!f.name || lower.startsWith('.') || lower.startsWith('~$') || SYSTEM_FILES.has(lower)) continue;
    if (!DOC_UPLOAD_EXTENSIONS.includes(extensionOf(lower))) {
      rejected.push({ name: relativePathOf(f), reason: 'Unsupported file type' });
    } else if (f.size === 0) {
      rejected.push({ name: relativePathOf(f), reason: 'Empty file' });
    } else if (f.size > MAX_DOC_FILE_BYTES) {
      rejected.push({ name: relativePathOf(f), reason: `Larger than ${formatBytes(MAX_DOC_FILE_BYTES)}` });
    } else {
      accepted.push(f);
    }
  }
  return { accepted, rejected };
}

/* ─── Drag & drop (files and whole folders) ─────────────────────────────── */

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (ok: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void };
};

async function readEntry(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File | null>((resolve) => entry.file!(resolve, () => resolve(null)));
    if (file) {
      const path = entry.fullPath.replace(/^\/+/, '');
      if (path.includes('/')) droppedPaths.set(file, path);
      out.push(file);
    }
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns results in batches (Chrome: 100 at a time) and must
    // be called until it yields an empty batch, or big folders get truncated.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
      if (batch.length === 0) break;
      for (const child of batch) await readEntry(child, out);
    }
  }
}

/** Reads every file out of a drop, descending into dropped folders. */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  // Entries must be taken synchronously — the DataTransfer is emptied once
  // the drop event handler yields.
  const entries: FsEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') continue;
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const f = item.getAsFile();
      if (f) loose.push(f);
    }
  }
  if (entries.length === 0 && loose.length === 0) return Array.from(dataTransfer.files || []);

  const out: File[] = [...loose];
  for (const entry of entries) await readEntry(entry, out);
  return out;
}

/** Splits a list into consecutive chunks of at most `size` items. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
