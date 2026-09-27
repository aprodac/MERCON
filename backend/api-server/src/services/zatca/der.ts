/**
 * Minimal DER (ASN.1) encoder — just the types a ZATCA certificate signing
 * request needs. Node's crypto can make secp256k1 keys and sign, but it has no
 * CSR builder, and WebCrypto-based CSR libraries don't support secp256k1.
 */

function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let n = length;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}

export const sequence = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
export const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items));
export const integer = (value: number) => tlv(0x02, Buffer.from([value]));
export const utf8String = (value: string) => tlv(0x0c, Buffer.from(value, 'utf8'));
export const printableString = (value: string) => tlv(0x13, Buffer.from(value, 'ascii'));
export const octetString = (content: Buffer) => tlv(0x04, content);
/** Unused-bits byte is always 0 here: signatures are whole bytes. */
export const bitString = (content: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), content]));
/** Constructed, context-specific tag [n] wrapping already-encoded content. */
export const contextTag = (n: number, content: Buffer) => tlv(0xa0 + n, content);

export function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk: number[] = [part & 0x7f];
    let n = part >>> 7;
    while (n > 0) {
      chunk.unshift((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/** One RelativeDistinguishedName holding a single attribute. */
export const rdn = (attrOid: string, value: Buffer) => set(sequence(oid(attrOid), value));
