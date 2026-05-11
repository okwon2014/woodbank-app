// EXIF 추출 — GPS + 촬영시각
"use client";

import exifr from "exifr";

export interface ExifData {
  taken_at: string | null;
  lat: number | null;
  lon: number | null;
}

export async function readExif(file: File): Promise<ExifData> {
  try {
    const meta = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"],
      reviveValues: true,
    });
    if (!meta) return { taken_at: null, lat: null, lon: null };
    const taken = (meta.DateTimeOriginal ?? meta.CreateDate) as Date | string | undefined;
    const takenIso = taken instanceof Date
      ? taken.toISOString()
      : typeof taken === "string" ? taken : null;
    return {
      taken_at: takenIso,
      lat: typeof meta.latitude === "number" ? meta.latitude : null,
      lon: typeof meta.longitude === "number" ? meta.longitude : null,
    };
  } catch {
    return { taken_at: null, lat: null, lon: null };
  }
}
