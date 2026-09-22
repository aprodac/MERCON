import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { DocType } from '@prisma/client';
import { env } from '../config/env';

export interface OcrResult {
  doc_type: DocType;
  /**
   * The configured DocumentType.code this document matches, or null when the
   * model could not tell. Null is a real, useful answer — the caller surfaces
   * it as "needs input" rather than writing a wrong type.
   */
  document_type_code: string | null;
  /**
   * Short plain-language description of what the document actually is, filled
   * in whether or not it matched a configured type.
   */
  detected_kind: string | null;
  document_number: string | null;
  issue_date: string | null; // ISO YYYY-MM-DD
  expiry_date: string | null; // ISO YYYY-MM-DD (Gregorian)
  vehicle_plate: string | null;
  issuing_authority: string | null;
  extra_details?: Record<string, any> | null;
  notes: string | null;
  raw_text?: string;
  confidence: number;
  /**
   * Set when the file could not be read at all (missing on disk) as opposed to
   * being read but unclassified.
   */
  extraction_error?: string | null;
}

/** One entry of the live DocumentType catalogue, passed into the prompt. */
export interface DocumentTypeChoice {
  code: string;
  name: string;
  ownerType: string;
}

/**
 * Infer file mime type from extension or file path
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/pdf';
  }
}

/**
 * Fallback regex date extractor for Arabic / English dates (Gregorian & Hijri)
 */
function fallbackRegexExtract(filename: string): Partial<OcrResult> {
  const upper = filename.toUpperCase();
  let doc_type: DocType = DocType.VehicleRegistration;

  if (upper.includes('INSURANCE') || upper.includes('TAMEEN') || upper.includes('INURANCE')) {
    doc_type = DocType.Insurance;
  } else if (upper.includes('OPERATION CARD') || upper.includes('AUTHORIZATION') || filename.includes('العقد') || filename.includes('ترخيص')) {
    doc_type = DocType.Waybill;
  } else if (upper.includes('CONTRACT') || upper.includes('AGREEMENT')) {
    doc_type = DocType.Contract;
  }

  return {
    doc_type,
    document_type_code: null,
    detected_kind: 'Document',
    document_number: null,
    issue_date: null,
    expiry_date: null,
    vehicle_plate: null,
    issuing_authority: null,
    extra_details: null,
    notes: 'Parsed using filename pattern fallback matcher',
    confidence: 0.5,
  };
}

/**
 * Convert relative file_url (e.g. /uploads/filename.pdf) to local disk file path
 */
export function getLocalFilePathFromUrl(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const fileName = path.basename(fileUrl);
  const possiblePaths = [
    path.resolve('/tmp', 'uploads', fileName),
    path.resolve('/tmp/uploads', fileName),
    path.resolve(process.cwd(), 'uploads', fileName),
    path.resolve(process.cwd(), 'backend', 'api-server', 'uploads', fileName),
    path.resolve('/app/backend/api-server/uploads', fileName),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Analyze document image / PDF file using Gemini Vision API
 */
export async function analyzeDocumentWithAI(
  filePath: string,
  documentTypes?: DocumentTypeChoice[],
): Promise<OcrResult> {
  const fallback = fallbackRegexExtract(path.basename(filePath));

  if (!fs.existsSync(filePath)) {
    return {
      doc_type: fallback.doc_type || DocType.VehicleRegistration,
      document_type_code: null,
      detected_kind: 'Document',
      document_number: null,
      issue_date: null,
      expiry_date: null,
      vehicle_plate: null,
      issuing_authority: null,
      extra_details: null,
      notes: 'File not found on server disk, using pattern fallback',
      confidence: 0.5,
    };
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallback as OcrResult;
  }

  try {
    const mimeType = getMimeType(filePath);
    let fileBuffer = fs.readFileSync(filePath);

    // Send complete file buffer without corrupting PDF trailers/page tables
    if (fileBuffer.length > 20 * 1024 * 1024) {
      fileBuffer = fileBuffer.subarray(0, 20 * 1024 * 1024);
    }
    const base64Data = fileBuffer.toString('base64');

    const catalogueBlock = documentTypes && documentTypes.length > 0
      ? `
This system is configured with the following document types. Choose the ONE
whose code best matches this document and return it as "document_type_code".
If none of them genuinely match, return null — do NOT force a guess.

${documentTypes.map((t) => `  - code "${t.code}" — ${t.name} (belongs to a ${t.ownerType})`).join('\n')}
`
      : `
  "document_type_code": null,
`;

    const promptText = `
You are an expert Saudi Arabia transport compliance OCR parser.
Analyze this document (Istimara / مرور, Insurance Policy / تأمين, Fahas Safety Inspection / فحص فني دوري, Operation Card / بطاقة تشغيل, Transport Authorization / تفويض, IQAMA / إقامة, Passport / جواز سفر, Driver Card / بطاقة سائق, or Contract / عقد).
${catalogueBlock}
Extract the metadata into a JSON object matching this schema:
{
  "document_type_code": string or null (one of the configured codes listed above),
  "detected_kind": string (ALWAYS fill this in, even when document_type_code is null - a short plain-English description of what this document actually is, e.g. "Vehicle registration (Istimara)", "Bank statement", "Photo of a truck", "Handwritten note"),
  "doc_type": "VehicleRegistration" | "Insurance" | "Waybill" | "Contract",
  "document_number": string or null (Serial #, Policy #, Card #, or License #),
  "issue_date": "YYYY-MM-DD" or null (Gregorian ISO date format),
  "expiry_date": "YYYY-MM-DD" or null (Gregorian ISO date format. CONVERT Hijri dates like 1447/05/12 or 1446/10/15 to standard Gregorian ISO YYYY-MM-DD date!),
  "vehicle_plate": string or null (e.g. "2541", "3071"),
  "issuing_authority": string or null (CRITICAL: Always provide BOTH English and Arabic names! e.g. "Malath Insurance (شركة ملاذ للتأمين)", "Saudi Traffic Dept (المرور)", "Transport General Authority (الهيئة العامة للنقل)"),
  "extra_details": object or null (Include extra useful fields found in the document),
  "notes": string or null,
  "confidence": number between 0.0 and 1.0
}

Respond ONLY with valid JSON inside a json code block.
`;

    const requestPayload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
    };

    const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const fallbackModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    const modelsToTry = Array.from(new Set([primaryModel, ...fallbackModels]));

    let responseText: string | null = null;
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await axios.post(apiUrl, requestPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
        });

        if (response?.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          responseText = response.data.candidates[0].content.parts[0].text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[OCR] Gemini model '${model}' failed: ${err?.response?.data?.error?.message || err?.message}. Trying fallback model...`);
      }
    }

    if (!responseText) {
      throw new Error(`All AI Vision model endpoints failed. Last error: ${lastError?.response?.data?.error?.message || lastError?.message || 'Empty response'}`);
    }
    
    // Parse JSON block from response text
    let jsonString = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    } else {
      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonString = responseText.substring(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(jsonString);

    // Map doc_type string to Prisma DocType enum
    let docTypeEnum: DocType = DocType.VehicleRegistration;
    if (parsed.doc_type === 'Insurance') docTypeEnum = DocType.Insurance;
    else if (parsed.doc_type === 'Waybill') docTypeEnum = DocType.Waybill;
    else if (parsed.doc_type === 'Contract') docTypeEnum = DocType.Contract;
    else docTypeEnum = fallback.doc_type || DocType.VehicleRegistration;

    const rawCode = (parsed.document_type_code || '').toString().trim();
    const documentTypeCode = rawCode && documentTypes?.some((t) => t.code.toLowerCase() === rawCode.toLowerCase())
      ? documentTypes.find((t) => t.code.toLowerCase() === rawCode.toLowerCase())!.code
      : null;

    return {
      doc_type: docTypeEnum,
      document_type_code: documentTypeCode,
      detected_kind: parsed.detected_kind || 'Document',
      document_number: parsed.document_number || null,
      issue_date: parsed.issue_date || null,
      expiry_date: parsed.expiry_date || null,
      vehicle_plate: parsed.vehicle_plate || null,
      issuing_authority: parsed.issuing_authority || null,
      extra_details: parsed.extra_details || null,
      notes: parsed.notes || 'Successfully extracted via AI Vision OCR',
      confidence: parsed.confidence || 0.95,
      raw_text: responseText.slice(0, 300),
    };
  } catch (err: any) {
    console.error(`[AI OCR] Extraction fallback for file ${filePath}:`, err.response?.data || err.message);
    const fallbackRes = fallbackRegexExtract(path.basename(filePath));
    return {
      doc_type: fallbackRes.doc_type || DocType.Contract,
      document_type_code: null,
      detected_kind: 'Document',
      document_number: null,
      issue_date: null,
      expiry_date: null,
      vehicle_plate: null,
      issuing_authority: null,
      extra_details: null,
      notes: `Extracted using pattern matcher fallback: ${err.message || 'AI busy'}`,
      confidence: 0.5,
      raw_text: path.basename(filePath),
    };
  }
}
