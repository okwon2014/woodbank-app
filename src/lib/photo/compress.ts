// 사진 압축. 품질 프리셋 3종 — 단말 저장공간·업로드 용량과 디테일 사이의 균형.
"use client";

import imageCompression from "browser-image-compression";

export type PhotoQuality = "fast" | "normal" | "high";

interface CompressOption {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  initialQuality: number;
}

const PRESETS: Record<PhotoQuality, CompressOption> = {
  fast:   { maxSizeMB: 0.4, maxWidthOrHeight: 800,  initialQuality: 0.75 },
  normal: { maxSizeMB: 1.5, maxWidthOrHeight: 1600, initialQuality: 0.85 },
  high:   { maxSizeMB: 4,   maxWidthOrHeight: 2400, initialQuality: 0.9 },
};

export const PHOTO_QUALITY_LABELS: Record<PhotoQuality, string> = {
  fast: "빠름(800px·저용량)",
  normal: "보통(1600px)",
  high: "고화질(2400px)",
};

export async function compressImage(file: File, quality: PhotoQuality = "normal"): Promise<Blob> {
  const p = PRESETS[quality];
  return imageCompression(file, {
    ...p,
    useWebWorker: true,
    fileType: "image/jpeg" as const,
    alwaysKeepResolution: false,
  });
}

export async function sha256OfBlob(blob: Blob): Promise<string | null> {
  if (!crypto?.subtle) return null;
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
