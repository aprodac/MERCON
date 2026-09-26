import { describe, expect, it } from 'vitest';
import { chunk, folderOf, isFromFolder, partitionUploadable, relativePathOf } from '../fileDrop';

const file = (name: string, size = 10, relPath?: string) => {
  const f = new File([new Uint8Array(size)], name);
  if (relPath) Object.defineProperty(f, 'webkitRelativePath', { value: relPath });
  return f;
};

describe('partitionUploadable', () => {
  it('keeps supported documents and reports unsupported ones', () => {
    const { accepted, rejected } = partitionUploadable([file('a.pdf'), file('b.JPG'), file('c.zip'), file('d.exe')]);
    expect(accepted.map((f) => f.name)).toEqual(['a.pdf', 'b.JPG']);
    expect(rejected.map((r) => r.name)).toEqual(['c.zip', 'd.exe']);
  });

  it('silently drops hidden and system files from folders', () => {
    const { accepted, rejected } = partitionUploadable([file('.DS_Store'), file('Thumbs.db'), file('~$draft.docx'), file('ok.png')]);
    expect(accepted.map((f) => f.name)).toEqual(['ok.png']);
    expect(rejected).toEqual([]);
  });

  it('rejects empty files', () => {
    const { accepted, rejected } = partitionUploadable([file('empty.pdf', 0)]);
    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toBe('Empty file');
  });
});

describe('folder paths', () => {
  it('uses webkitRelativePath from folder picks', () => {
    const f = file('isthimara.pdf', 10, 'Trucks/1234 ABC/isthimara.pdf');
    expect(relativePathOf(f)).toBe('Trucks/1234 ABC/isthimara.pdf');
    expect(folderOf(f)).toBe('Trucks/1234 ABC');
    expect(isFromFolder(f)).toBe(true);
  });

  it('treats loose files as not from a folder', () => {
    const f = file('scan.pdf');
    expect(relativePathOf(f)).toBe('scan.pdf');
    expect(folderOf(f)).toBe('');
    expect(isFromFolder(f)).toBe(false);
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
