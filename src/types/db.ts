// 공통 도메인 타입. 실제 데이터베이스 타입은 추후 `supabase gen types typescript` 로 자동생성 권장.

export type UserRole = "admin" | "lead" | "surveyor" | "collaborator" | "guest";
export type SyncStatus = "draft" | "queued" | "synced" | "conflict";
export type PhotoCategory = "tree_form" | "bark" | "branch" | "leaf_litter";
export type TreeStatus = "active" | "lost" | "deceased";

export interface Site {
  id: string;
  code: string;
  region_sido: string | null;
  region_sigungu: string | null;
  region_sigungu_code: string | null;
  address_detail: string | null;
  habitat_terrain: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tree {
  id: string;
  site_id: string;
  tree_local_no: string;
  species_code: string | null;
  lat: number | null;
  lon: number | null;
  lat_dms: string | null;
  lon_dms: string | null;
  elevation_m: number | null;
  aspect_deg: number | null;
  tag_id: string | null;
  status: TreeStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SamplingEvent {
  id: string;
  tree_id: string;
  sample_no: string;
  sampled_at: string; // ISO date
  height_m: number | null;
  dbh_cm: number | null;
  dna_collected: boolean;
  dna_sample_code: string | null;
  notes: string | null;
  surveyor_id: string | null;
  co_surveyors: string[];
  device_recorded_at: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface PhotoMeta {
  id: string;
  event_id: string;
  category: PhotoCategory;
  storage_path: string;
  original_filename: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  exif_taken_at: string | null;
  exif_lat: number | null;
  exif_lon: number | null;
  sha256: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface Species {
  code: string;
  ko_name: string;
  sci_name: string | null;
  family: string | null;
  active: boolean;
}

// 오프라인 큐의 페이로드
export interface QueuedEvent {
  kind: "sampling_event";
  event: SamplingEvent;
  // tree/site 가 아직 서버에 없을 수도 있어 같이 동봉 (자동 upsert)
  tree?: Tree;
  site?: Site;
}
export interface QueuedPhoto {
  kind: "photo";
  meta: Omit<PhotoMeta, "storage_path" | "uploaded_at"> & { storage_path?: string };
  // Blob 은 별도 photos_pending 테이블에 저장
}
export type QueueItem = QueuedEvent | QueuedPhoto;
