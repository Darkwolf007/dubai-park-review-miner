import { utils, writeFile } from 'xlsx';
import { toPng } from 'html-to-image';
import type { GeoJsonFeatureCollection } from './types';

export interface ZipTextFile {
  path: string;
  content: string;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipHeader(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/** Creates a standards-compliant ZIP using the STORE method. JSON is intentionally left
 * uncompressed so the archive has no runtime dependency and every entry remains inspectable. */
export function createStoredZip(files: ZipTextFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path.replaceAll('\\', '/'));
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local = zipHeader(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    localParts.push(local.bytes, data);

    const central = zipHeader(46 + name.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, localOffset, true);
    central.bytes.set(name, 46);
    centralParts.push(central.bytes);
    localOffset += local.bytes.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipHeader(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, localOffset, true);

  const totalSize = localOffset + centralSize + end.bytes.length;
  const archive = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end.bytes]) {
    archive.set(part, offset);
    offset += part.length;
  }
  return archive;
}

export function downloadZip(files: ZipTextFile[], filename: string) {
  const bytes = createStoredZip(files);
  const blob = new Blob([bytes.buffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadGeoJson(fc: GeoJsonFeatureCollection, filename: string) {
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(csvString: string, filename: string) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(rows: Record<string, any>[], filename: string, sheetName = 'Data') {
  const worksheet = utils.json_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, sheetName);
  writeFile(workbook, filename);
}

export async function downloadMapScreenshot(mapElement: HTMLElement, filename: string) {
  const dataUrl = await toPng(mapElement, { cacheBust: true, backgroundColor: '#ffffff' });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
