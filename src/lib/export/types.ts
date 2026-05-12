export interface PhotoExport {
  id: string;
  category: "tree_form" | "bark" | "branch" | "leaf_litter";
  signedUrl: string | null;
}

export interface EventExport {
  id: string;
  sample_no: string;
  sampled_at: string;
  height_m: number | null;
  dbh_cm: number | null;
  dna_collected: boolean;
  dna_sample_code: string | null;
  notes: string | null;
  surveyor_name: string | null;

  tree_local_no: string;
  species_code: string | null;
  species_ko: string | null;
  lat: number | null;
  lon: number | null;
  lat_dms: string | null;
  lon_dms: string | null;
  elevation_m: number | null;
  aspect_deg: number | null;

  site_code: string;
  region_sido: string | null;
  region_sigungu: string | null;
  region_sigungu_code: string | null;
  address_detail: string | null;
  habitat_terrain: string | null;

  photos: PhotoExport[];
}

export const PHOTO_LABELS: Record<PhotoExport["category"], string> = {
  tree_form: "수형",
  bark: "수피",
  branch: "가지",
  leaf_litter: "잎/낙엽",
};
