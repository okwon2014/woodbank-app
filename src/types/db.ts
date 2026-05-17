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

export type SpecimenTypeCode = "D" | "C" | "B" | "L" | "T" | "F" | "X" | "R" | "N" | "A" | "I" | "O";
export type SpecimenStatus = "active" | "consumed" | "lost" | "destroyed";

export interface SpecimenType {
  code: SpecimenTypeCode;
  key: string; // specimen_type 컬럼 값
  ko: string;
  en: string;
  description: string;
}

// 시편 종류 마스터 — 마이그레이션 007 의 분류와 동일하게 유지.
// DB 에는 specimen_type/type_code 에 CHECK 제약이 없어 코드 레벨에서만 관리한다.
// N(DNA)/A(DART)/I(NIR) 은 현장 채취 단계에서 1차 시편으로도 등록 가능.
export const SPECIMEN_TYPES: SpecimenType[] = [
  { code: "D", key: "disc",      ko: "디스크",      en: "Disc",       description: "줄기 또는 가지를 가로로 잘라낸 원판" },
  { code: "C", key: "core",      ko: "증분코어",    en: "Core",       description: "Increment borer 등으로 채취한 막대형 시추" },
  { code: "B", key: "block",     ko: "블록",        en: "Block",      description: "디스크/코어에서 잘라낸 작은 토막" },
  { code: "L", key: "slide",     ko: "현미경 슬라이드", en: "Slide",   description: "박편/영구 슬라이드" },
  { code: "T", key: "tree_ring", ko: "연륜표본",    en: "Tree-ring",  description: "연륜 측정·교차연대측정용" },
  { code: "F", key: "fiber",     ko: "해리 섬유",   en: "Fiber",      description: "해리된 단섬유 표본" },
  { code: "X", key: "extract",   ko: "추출물",      en: "Extract",    description: "DNA·화학 추출물" },
  { code: "R", key: "residue",   ko: "잔여 보존",   en: "Residue",    description: "분석 후 남은 보관용" },
  { code: "N", key: "dna",       ko: "DNA 시료",    en: "DNA Sample", description: "현장에서 채취한 잎/캠비움 등 DNA 추출용 원시료" },
  { code: "A", key: "dart",      ko: "DART 분석용", en: "DART",       description: "DART-MS 분석을 위해 분취한 시편" },
  { code: "I", key: "nir",       ko: "NIR 분석용",  en: "NIR",        description: "근적외선(NIR) 분광 분석을 위해 분취한 시편" },
  { code: "O", key: "other",     ko: "기타",        en: "Other",      description: "위에 없는 분류" },
];

export const SPECIMEN_STATUSES: { value: SpecimenStatus; ko: string }[] = [
  { value: "active",    ko: "보관 중" },
  { value: "consumed",  ko: "소진" },
  { value: "lost",      ko: "분실" },
  { value: "destroyed", ko: "폐기" },
];

export interface Specimen {
  id: string;
  human_code: string;
  parent_id: string | null;
  root_event_id: string;
  specimen_type: string;
  type_code: SpecimenTypeCode;
  seq_no: number;
  description: string | null;
  storage_location: string | null;
  status: SpecimenStatus;
  external_id: string | null;
  external_namespace: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DnaResult {
  id: string;
  // 008 마이그레이션 이후 specimen_id 가 주 식별자. event_id 는 deprecated 이지만
  // 베타 호환을 위해 nullable 로 유지.
  specimen_id: string | null;
  event_id: string | null;
  analysis_type: string | null;
  identification_result: string | null;
  similarity_score: number | null;
  analyst: string | null;
  analyzed_at: string | null; // ISO date
  file_storage_path: string | null;
  file_original_name: string | null;
  file_bytes: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
