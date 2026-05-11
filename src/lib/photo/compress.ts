// 사진 압축 — 최대 1600px, 85% JPEG
"use client";

import imageCompression from "browser-image-compression";

export async function compressImage(file: File): Promise<Blob> {
  const options = {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 1600,
    initialQuality: 0.85,
    useWebWorker: true,
    fileType: "image/jpeg" as const,
    alwaysKeepResolution: false,
  };
  return imageCompression(file, options);
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
