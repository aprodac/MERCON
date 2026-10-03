import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';

/**
 * Re-encodes driver videos after upload so they don't fill the disk.
 *
 * Phones record 30s delay videos at 1080p/4K — 20–60 MB each, roughly a
 * hundred compressed photos. Re-encoding to 720p H.264 (CRF 28, AAC 64k)
 * brings that to a few MB and plays everywhere (web, WhatsApp, both apps).
 *
 * Runs in the background, one video at a time, after the upload has already
 * answered the driver: a slow encode must never hold up the app. If ffmpeg is
 * missing or the encode fails, the original stays as it is. The result is
 * always .mp4, so the Document's file_url/mime_type are updated to match.
 */

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const ENCODE_TIMEOUT_MS = 5 * 60_000;

interface Job {
  documentId: string;
  filePath: string;
}

const queue: Job[] = [];
let working = false;
let ffmpegMissing = false;

export function queueVideoCompression(documentId: string, filePath: string): void {
  if (ffmpegMissing) return;
  queue.push({ documentId, filePath });
  void drain();
}

async function drain(): Promise<void> {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        await compressVideo(job);
      } catch (err) {
        logger.warn({ err, documentId: job.documentId }, '[VideoCompressor] Keeping original video');
      }
    }
  } finally {
    working = false;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    const timer = setTimeout(() => proc.kill('SIGKILL'), ENCODE_TIMEOUT_MS);
    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        ffmpegMissing = true;
        logger.warn('[VideoCompressor] ffmpeg not installed — videos are stored uncompressed');
      }
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

async function compressVideo({ documentId, filePath }: Job): Promise<void> {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const tmpPath = path.join(dir, `${base}.compressing.mp4`);
  const finalPath = path.join(dir, `${base}.mp4`);

  try {
    await runFfmpeg([
      '-y', '-i', filePath,
      // Fit inside 1280x720 (either orientation), never upscale, keep even dimensions.
      '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '64k',
      '-movflags', '+faststart',
      tmpPath,
    ]);

    const before = fs.statSync(filePath).size;
    const after = fs.statSync(tmpPath).size;
    if (after >= before) {
      fs.unlinkSync(tmpPath);
      return;
    }

    if (finalPath !== filePath) {
      // New name (.mov → .mp4): point the Document at it before removing the old file.
      fs.renameSync(tmpPath, finalPath);
      await prisma.document.update({
        where: { id: documentId },
        data: { file_url: `/uploads/${path.basename(finalPath)}`, mime_type: 'video/mp4' },
      });
      fs.unlinkSync(filePath);
    } else {
      fs.renameSync(tmpPath, filePath);
      await prisma.document.update({ where: { id: documentId }, data: { mime_type: 'video/mp4' } });
    }

    logger.info(
      { documentId, beforeMb: +(before / 1e6).toFixed(1), afterMb: +(after / 1e6).toFixed(1) },
      '[VideoCompressor] Video compressed',
    );
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}
