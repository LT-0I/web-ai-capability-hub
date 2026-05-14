const fs = require("node:fs");
const pathModule = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

export interface VerifyDocxMinOptions {
  minParagraphs: number;
  minChars: number;
  topicRegex?: RegExp;
  recordSha256?: boolean;
}

export interface VerifyDocxMinResult {
  ok: boolean;
  path: string;
  size: number;
  sha256?: string;
  paragraphs: number;
  chars: number;
  topicMatched?: boolean;
  failures: string[];
}

interface ZipEntry { name: string; compression: number; compressedSize: number; uncompressedSize: number; localHeaderOffset: number; }

export function verifyDocxMin(path: string, opts: VerifyDocxMinOptions): VerifyDocxMinResult {
  const failures: string[] = [];
  const resolvedPath = pathModule.resolve(path);
  let bytes: any;
  try {
    bytes = fs.readFileSync(resolvedPath);
  } catch (error) {
    return emptyResult(resolvedPath, 0, opts, [`FILE_READ_FAILED: ${error instanceof Error ? error.message : String(error)}`]);
  }

  let documentXml = "";
  try {
    documentXml = extractZipEntry(bytes, "word/document.xml").toString("utf8");
  } catch (error) {
    failures.push(`INVALID_DOCX_ZIP: ${error instanceof Error ? error.message : String(error)}`);
  }

  const paragraphs = documentXml ? countParagraphs(documentXml) : 0;
  const bodyText = documentXml ? extractTextRuns(documentXml) : "";
  const chars = bodyText.length;
  if (paragraphs < opts.minParagraphs) failures.push(`MIN_PARAGRAPHS_NOT_MET: expected >= ${opts.minParagraphs}, got ${paragraphs}`);
  if (chars < opts.minChars) failures.push(`MIN_CHARS_NOT_MET: expected >= ${opts.minChars}, got ${chars}`);

  let topicMatched: boolean | undefined;
  if (opts.topicRegex) {
    topicMatched = opts.topicRegex.test(bodyText);
    if (!topicMatched) failures.push("TOPIC_REGEX_NOT_MATCHED");
  }

  return {
    ok: failures.length === 0,
    path: resolvedPath,
    size: bytes.length,
    ...(opts.recordSha256 === false ? {} : { sha256: hash(bytes) }),
    paragraphs,
    chars,
    ...(topicMatched === undefined ? {} : { topicMatched }),
    failures
  };
}

function emptyResult(path: string, size: number, opts: VerifyDocxMinOptions, failures: string[]): VerifyDocxMinResult {
  return { ok: false, path, size, paragraphs: 0, chars: 0, ...(opts.topicRegex ? { topicMatched: false } : {}), failures };
}

function hash(bytes: any): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function extractZipEntry(zip: any, entryName: string): any {
  const entry = readCentralDirectory(zip).find((item) => item.name === entryName);
  if (!entry) throw new Error(`missing ${entryName}`);
  const offset = entry.localHeaderOffset;
  if (zip.readUInt32LE(offset) !== 0x04034b50) throw new Error(`invalid local header for ${entryName}`);
  const fileNameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > zip.length) throw new Error(`entry ${entryName} exceeds zip bounds`);
  const compressed = zip.subarray(dataStart, dataEnd);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`unsupported compression method ${entry.compression} for ${entryName}`);
}

function readCentralDirectory(zip: any): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(zip);
  if (eocdOffset < 0) throw new Error("end of central directory not found");
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralDirSize = zip.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = zip.readUInt32LE(eocdOffset + 16);
  if (centralDirOffset + centralDirSize > zip.length) throw new Error("central directory exceeds zip bounds");

  const entries: ZipEntry[] = [];
  let cursor = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("invalid central directory header");
    const compression = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const fileNameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const name = zip.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    entries.push({ name, compression, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = nameStart + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(zip: any): number {
  const minOffset = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= minOffset; offset--) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function countParagraphs(xml: string): number {
  return (xml.match(/<w:p(?:\s|>)/g) || []).length;
}

function extractTextRuns(xml: string): string {
  const runs: string[] = [];
  const regex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) runs.push(decodeXml(match[1]));
  return runs.join("");
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
