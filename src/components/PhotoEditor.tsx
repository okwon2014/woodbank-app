"use client";

import { useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { compressImage, readImageDimensions, sha256OfBlob } from "@/lib/photo/compress";
import { readExif } from "@/lib/photo/exif";
import { uuidv7 } from "@/lib/utils";
import type { PhotoCategory } from "@/types/db";

export interface PhotoWithUrl {
  id: string;
  category: PhotoCategory;
  storage_path: string;
  signedUrl: string | null;
  original_filename: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  exif_taken_at: string | null;
}

const PHOTO_LABELS: Record<PhotoCategory, string> = {
  tree_form: "수형",
  bark: "수피",
  branch: "가지",
  leaf_litter: "잎/낙엽",
};

interface Props {
  eventId: string;
  initialPhotos: PhotoWithUrl[];
}

export function PhotoEditor({ eventId, initialPhotos }: Props) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>(initialPhotos);
  const [busy, setBusy] = useState<PhotoCategory | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function byCategory(cat: PhotoCategory) {
    return photos.filter((p) => p.category === cat);
  }

  async function uploadNew(cat: PhotoCategory, file: File) {
    setBusy(cat);
    setErr(null);
    try {
      const sb = getSupabaseBrowser();
      const [compressed, exif] = await Promise.all([compressImage(file), readExif(file)]);
      const dims = await readImageDimensions(compressed);
      const sha = await sha256OfBlob(compressed);
      const id = uuidv7();
      const path = `events/${eventId}/${id}.jpg`;

      // 1) Storage 업로드
      const { error: upErr } = await sb.storage.from("photos").upload(path, compressed, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (upErr) throw upErr;

      // 2) DB insert
      const { data: { user } } = await sb.auth.getUser();
      const { error: insErr } = await sb.from("photos").insert({
        id,
        event_id: eventId,
        category: cat,
        storage_path: path,
        original_filename: file.name,
        width: dims.width,
        height: dims.height,
        bytes: compressed.size,
        exif_taken_at: exif.taken_at,
        exif_lat: exif.lat,
        exif_lon: exif.lon,
        sha256: sha,
        uploaded_by: user?.id ?? null,
      });
      if (insErr) throw insErr;

      // 3) signed URL 발급해서 미리보기 가능하게
      const { data: signed } = await sb.storage.from("photos").createSignedUrl(path, 900);

      setPhotos((prev) => [...prev, {
        id, category: cat, storage_path: path,
        signedUrl: signed?.signedUrl ?? null,
        original_filename: file.name,
        width: dims.width, height: dims.height,
        bytes: compressed.size,
        exif_taken_at: exif.taken_at,
      }]);
    } catch (e: any) {
      setErr(e?.message ?? "업로드 실패");
    } finally {
      setBusy(null);
    }
  }

  async function deletePhoto(p: PhotoWithUrl) {
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    setBusy(p.category);
    setErr(null);
    try {
      const sb = getSupabaseBrowser();
      // 1) Storage에서 객체 삭제
      const { error: rmErr } = await sb.storage.from("photos").remove([p.storage_path]);
      if (rmErr) throw rmErr;
      // 2) DB row 삭제
      const { error: delErr } = await sb.from("photos").delete().eq("id", p.id);
      if (delErr) throw delErr;
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      setErr(e?.message ?? "삭제 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-brand-700">사진</h2>
      {err && <p className="text-rose-700 text-sm bg-rose-50 p-2 rounded">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(PHOTO_LABELS) as PhotoCategory[]).map((cat) => (
          <CategorySlot
            key={cat}
            category={cat}
            label={PHOTO_LABELS[cat]}
            items={byCategory(cat)}
            busy={busy === cat}
            onUpload={(file) => uploadNew(cat, file)}
            onDelete={deletePhoto}
          />
        ))}
      </div>
    </div>
  );
}

function CategorySlot({
  category, label, items, busy, onUpload, onDelete,
}: {
  category: PhotoCategory;
  label: string;
  items: PhotoWithUrl[];
  busy: boolean;
  onUpload: (file: File) => void;
  onDelete: (p: PhotoWithUrl) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-brand-700 underline disabled:opacity-50"
        >
          {busy ? "처리 중…" : "+ 추가"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.currentTarget.value = "";
        }}
      />
      {items.length === 0 ? (
        <div className="aspect-square rounded-md bg-stone-100 flex items-center justify-center text-stone-400 text-xs">
          사진 없음
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div key={p.id} className="relative">
              {p.signedUrl ? (
                <img
                  src={p.signedUrl}
                  alt={label}
                  className="w-full aspect-square object-cover rounded-md"
                />
              ) : (
                <div className="aspect-square bg-stone-200 rounded-md" />
              )}
              <button
                type="button"
                onClick={() => onDelete(p)}
                disabled={busy}
                className="absolute top-1 right-1 text-xs bg-white/90 border border-rose-300 text-rose-700 rounded px-2 py-0.5 hover:bg-rose-50"
              >
                삭제
              </button>
              <p className="mt-1 text-[10px] text-stone-500">
                {p.bytes ? `${Math.round(p.bytes / 1024)} KB` : ""}
                {p.width && p.height && ` · ${p.width}×${p.height}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
