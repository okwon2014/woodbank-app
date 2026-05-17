"use client";

import { useEffect, useState } from "react";
import { fmtDateTimeKst } from "@/lib/utils";

export interface LightboxPhoto {
  id: string;
  category: string;
  signedUrl: string | null;
  original_filename: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  exif_taken_at: string | null;
  uploaded_at?: string;
}

interface Props {
  photos: LightboxPhoto[];
  startIndex: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, startIndex, onClose }: Props) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(photos.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [photos.length, onClose]);

  if (photos.length === 0) return null;
  const p = photos[idx];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white text-sm">
        <div>
          {idx + 1} / {photos.length} · {p.category} · {p.original_filename}
        </div>
        <button onClick={onClose} className="text-xs border border-white/30 rounded px-2 py-1">닫기</button>
      </div>

      <div
        className="flex-1 flex items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {p.signedUrl ? (
          <img src={p.signedUrl} alt={p.category} className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="text-white text-sm">이미지 로드 실패</div>
        )}
      </div>

      <div
        className="bg-stone-900/80 text-stone-100 text-xs px-4 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Kv label="크기" value={p.width && p.height ? `${p.width}×${p.height}` : "-"} />
        <Kv label="용량" value={p.bytes ? `${Math.round(p.bytes / 1024)} KB` : "-"} />
        <Kv label="촬영" value={fmtDateTimeKst(p.exif_taken_at)} />
        <Kv label="업로드" value={fmtDateTimeKst(p.uploaded_at)} />
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white text-xl disabled:opacity-20"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(photos.length - 1, i + 1)); }}
            disabled={idx === photos.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white text-xl disabled:opacity-20"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="opacity-60">{label}</div>
      <div>{value}</div>
    </div>
  );
}

// 클릭만으로 라이트박스 여는 래퍼
export function ClickableThumbnail({
  photos,
  index,
  className,
}: {
  photos: LightboxPhoto[];
  index: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const p = photos[index];
  if (!p?.signedUrl) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "block w-full"}>
        <img src={p.signedUrl} alt={p.category} className="w-full aspect-square object-cover rounded-md" />
      </button>
      {open && <PhotoLightbox photos={photos} startIndex={index} onClose={() => setOpen(false)} />}
    </>
  );
}
