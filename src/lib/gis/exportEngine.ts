import { utils, writeFile } from 'xlsx';
import { toPng } from 'html-to-image';
import type { GeoJsonFeatureCollection } from './types';

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
