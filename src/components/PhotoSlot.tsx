"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage, readImageDimensions, sha256OfBlob, type PhotoQuality } from "@/lib/photo/compress";
import { readExif } from "@/lib/photo/exif";
import type { PhotoCategory } from "@/types/db";
import { uuidv7 } from "@/lib/utils";

export interface StagedPhoto {
  id: string;
  category: PhotoCategory;
  blob: Blob;
  filename: string;
  sha256: string | null;
  width: number;
  height: number;
  bytes: number;
  exif_taken_at: string | null;
  exif_lat: number | null;
  exif_lon: number | null;
  previewUrl: string;
}

interface Props {
  category: PhotoCategory;
  label: string;
  value: StagedPhoto | null;
  onChange: (p: StagedPhoto | null) => void;
  quality?: PhotoQuality;
}

export function PhotoSlot({ category, label, value, onChange, quality = "normal" }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => () => {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
  }, [value?.previewUrl]);

  async function handlePick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const [compressed, exif] = await Promise.all([compressImage(file, quality), readExif(file)]);
      const dims = await readImageDimensions(compressed);
      const sha = await sha256OfBlob(compressed);
      const previewUrl = URL.createObjectURL(compressed);
      onChange({
        id: uuidv7(),
        category,
        blob: compressed,
        filename: file.name,
        sha256: sha,
        width: dims.width,
        height: dims.height,
        bytes: compressed.size,
        exif_taken_at: exif.taken_at,
        exif_lat: exif.lat,
        exif_lon: exif.lon,
        previewUrl,
      });
    } catch (e: any) {
      setErr(e?.message ?? "사진 처리 중 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{label}</span>
        {value && (
          <button
            type="button"
            className="text-xs text-rose-600"
            onClick={() => onChange(null)}
          >
            삭제
          </button>
        )}
      </div>
      {value ? (
        <img
          src={value.previewUrl}
          alt={label}
          className="w-full aspect-square object-cover rounded-md bg-stone-100"
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-square rounded-md border-2 border-dashed border-stone-300 text-stone-400 hover:border-brand-500 hover:text-brand-700 transition"
        >
          {busy ? "처리 중…" : "📷 촬영 / 선택"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0])}
      />
      {value && (
        <p className="mt-2 text-[11px] text-stone-500">
          {Math.round(value.bytes / 1024)} KB · {value.width}×{value.height}
          {value.exif_taken_at && <> · {new Date(value.exif_taken_at).toLocaleString("ko-KR")}</>}
        </p>
      )}
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
    </div>
  );
}
