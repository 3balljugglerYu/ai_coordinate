import "server-only";

import { inflateRawSync } from "node:zlib";

/**
 * .xlsx のシートを、行と列の文字列にして読む（新しい依存を入れないための最小限の読み込み）。
 *
 * X の広告の書き出しは CSV を選べず .xlsx だけなので、管理画面の取り込みで使う。
 * 読むのは「文字と数字のセル」だけ。書式・数式・日付の型は見ない（数式は計算済みの値を読む）。
 *
 * .xlsx は zip の中に XML が入ったもの。zip は末尾の目次（central directory）から
 * 中身の位置と大きさを読み、deflate を zlib でほどく。ZIP64（4GB 超）と暗号化は扱わない。
 * 読めないときは XlsxReadError を投げる（呼び出し側が「読めませんでした」と出す）。
 */

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxReadError";
  }
}

/** ほどいたあとの1ファイルの上限。小さな書き出しが極端に膨らむ zip で、メモリを使い切らない */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

interface ZipEntry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function fail(message: string): never {
  throw new XlsxReadError(message);
}

function findEndOfCentralDirectory(buf: Buffer): number {
  // 末尾 22 バイト＋コメント（最大 65535 バイト）の中にある
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === SIG_END) return i;
  }
  return fail("xlsx（zip）の目次が見つかりません");
}

function listZipEntries(buf: Buffer): Map<string, ZipEntry> {
  if (buf.length < 22) fail("ファイルが短すぎます");
  const end = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(end + 10);
  let offset = buf.readUInt32LE(end + 16);
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== SIG_CENTRAL) {
      fail("xlsx（zip）の目次が壊れています");
    }
    const flags = buf.readUInt16LE(offset + 8);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (flags & 0x1) fail("暗号化された xlsx は読めません");
    entries.set(name, {
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      localOffset: buf.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) fail("xlsx の中身が大きすぎます");
  const at = entry.localOffset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== SIG_LOCAL) {
    fail("xlsx（zip）の中身の位置が壊れています");
  }
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const end = start + entry.compressedSize;
  if (end > buf.length) fail("xlsx（zip）の中身が途中で切れています");
  const data = buf.subarray(start, end);
  if (entry.method === 0) return data;
  if (entry.method === 8) {
    try {
      return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
    } catch {
      return fail("xlsx（zip）の中身をほどけませんでした");
    }
  }
  return fail(`xlsx（zip）の圧縮方式 ${entry.method} は読めません`);
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const point = lower.startsWith("#x")
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decodeXml(match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/** <t> の中身をつなぐ。ふりがな（<rPh>）は値ではないので外す */
function readText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) {
    text += decodeXml(match[1] ?? "");
  }
  return text;
}

function readSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((match) =>
    readText(match[1] ?? ""),
  );
}

/** "AB12" の列の部分を 0 始まりの番号にする */
function columnIndex(ref: string): number | null {
  const letters = /^([A-Z]+)\d*$/i.exec(ref)?.[1]?.toUpperCase();
  if (!letters) return null;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function readSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const attributes = readAttributes(cellMatch[1]);
      const body = cellMatch[2] ?? "";
      const index = (attributes.r ? columnIndex(attributes.r) : null) ?? next;
      next = index + 1;
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (attributes.t === "s") {
        value = raw !== undefined ? (sharedStrings[Number(raw)] ?? "") : "";
      } else if (attributes.t === "inlineStr") {
        value = readText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      } else if (raw !== undefined) {
        value = decodeXml(raw);
      }
      while (row.length < index) row.push("");
      row[index] = value;
    }
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function resolveTarget(target: string): string {
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  // "xl/worksheets/../worksheets/sheet1.xml" のような書き方をそろえる
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export function readXlsx(data: Uint8Array): XlsxSheet[] {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const entries = listZipEntries(buf);
  const readEntry = (name: string): string | null => {
    const entry = entries.get(name);
    return entry ? readZipEntry(buf, entry).toString("utf8") : null;
  };

  const workbook = readEntry("xl/workbook.xml") ?? fail("xlsx の中に workbook がありません");
  const relations = new Map<string, string>();
  for (const match of (readEntry("xl/_rels/workbook.xml.rels") ?? "").matchAll(
    /<Relationship\b([^>]*?)\/?>/g,
  )) {
    const attributes = readAttributes(match[1]);
    if (attributes.Id && attributes.Target) {
      relations.set(attributes.Id, resolveTarget(attributes.Target));
    }
  }
  const sharedStrings = readSharedStrings(readEntry("xl/sharedStrings.xml"));

  const sheets: XlsxSheet[] = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const attributes = readAttributes(match[1]);
    const path = relations.get(attributes["r:id"] ?? "");
    const xml = path ? readEntry(path) : null;
    if (xml === null) continue;
    sheets.push({
      name: attributes.name ?? "",
      rows: readSheetRows(xml, sharedStrings),
    });
  }
  if (sheets.length === 0) fail("xlsx にシートがありません");
  return sheets;
}
