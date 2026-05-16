import { describe, it, expect } from "vitest";
import { remapToServerIds } from "./remap";
import type { SamplingEvent, Site, Tree } from "@/types/db";

// 테스트 픽스처 — 매번 새 객체를 만들어 mutation 영향이 없는지도 검증.
function makeFixture() {
  const now = "2026-05-16T03:00:00.000Z";
  const site: Site = {
    id: "client-site-uuid",
    code: "2026_담양",
    region_sido: "전라남도",
    region_sigungu: "담양군",
    region_sigungu_code: "46710",
    address_detail: null,
    habitat_terrain: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
  const tree: Tree = {
    id: "client-tree-uuid",
    site_id: "client-site-uuid",
    tree_local_no: "01",
    species_code: "QCAC",
    lat: 35.3,
    lon: 127.0,
    lat_dms: null,
    lon_dms: null,
    elevation_m: null,
    aspect_deg: null,
    tag_id: null,
    status: "active",
    created_by: null,
    created_at: now,
    updated_at: now,
  };
  const event: SamplingEvent = {
    id: "client-event-uuid",
    tree_id: "client-tree-uuid",
    sample_no: "2026_담양_01",
    sampled_at: "2026-05-16",
    height_m: 12,
    dbh_cm: 30,
    dna_collected: false,
    dna_sample_code: null,
    notes: null,
    surveyor_id: null,
    co_surveyors: [],
    device_recorded_at: now,
    sync_status: "queued",
    created_at: now,
    updated_at: now,
  };
  return { site, tree, event };
}

describe("remapToServerIds", () => {
  it("server id 가 모두 null 이면 payload 변경 없음 (신규 site/tree 등록 경로)", () => {
    const { site, tree, event } = makeFixture();
    const out = remapToServerIds({
      site,
      tree,
      event,
      serverSiteId: null,
      serverTreeId: null,
    });
    expect(out.site).toEqual(site);
    expect(out.tree).toEqual(tree);
    expect(out.event).toEqual(event);
    expect(out.siteRemapped).toBe(false);
    expect(out.treeRemapped).toBe(false);
  });

  it("server site id 가 client 와 같으면 매핑 안 함 (이미 일치)", () => {
    const { site, tree, event } = makeFixture();
    const out = remapToServerIds({
      site,
      tree,
      event,
      serverSiteId: site.id,
      serverTreeId: null,
    });
    expect(out.siteRemapped).toBe(false);
    expect(out.treeRemapped).toBe(false);
    expect(out.site!.id).toBe(site.id);
    expect(out.tree!.site_id).toBe(site.id);
  });

  it("server site id 가 다르면 site.id 와 tree.site_id 모두 server id 로 매핑 (다른 단말의 동일 code 시나리오)", () => {
    const { site, tree, event } = makeFixture();
    const serverSiteId = "server-existing-site-uuid";
    const out = remapToServerIds({
      site,
      tree,
      event,
      serverSiteId,
      serverTreeId: null,
    });
    expect(out.siteRemapped).toBe(true);
    expect(out.site!.id).toBe(serverSiteId);
    expect(out.tree!.site_id).toBe(serverSiteId);
    // event 는 그대로 (tree_id 는 server tree 가 없으니 매핑 안 됨)
    expect(out.event.tree_id).toBe(tree.id);
    expect(out.event.id).toBe(event.id); // event.id 는 절대 안 바뀜
  });

  it("server tree id 도 다르면 tree.id 와 event.tree_id 까지 매핑", () => {
    const { site, tree, event } = makeFixture();
    const serverSiteId = "server-site";
    const serverTreeId = "server-tree";
    const out = remapToServerIds({
      site,
      tree,
      event,
      serverSiteId,
      serverTreeId,
    });
    expect(out.siteRemapped).toBe(true);
    expect(out.treeRemapped).toBe(true);
    expect(out.site!.id).toBe(serverSiteId);
    expect(out.tree!.id).toBe(serverTreeId);
    expect(out.tree!.site_id).toBe(serverSiteId);
    expect(out.event.tree_id).toBe(serverTreeId);
    expect(out.event.id).toBe(event.id); // unchanged
  });

  it("event.id 는 어떠한 매핑에서도 절대 변경되지 않는다 (markSynced + photos.event_id 일관성)", () => {
    const { site, tree, event } = makeFixture();
    const out = remapToServerIds({
      site,
      tree,
      event,
      serverSiteId: "x",
      serverTreeId: "y",
    });
    expect(out.event.id).toBe(event.id);
  });

  it("입력 객체는 mutate 되지 않는다 (immutable)", () => {
    const { site, tree, event } = makeFixture();
    const siteSnapshot = JSON.stringify(site);
    const treeSnapshot = JSON.stringify(tree);
    const eventSnapshot = JSON.stringify(event);
    remapToServerIds({
      site,
      tree,
      event,
      serverSiteId: "new-site",
      serverTreeId: "new-tree",
    });
    expect(JSON.stringify(site)).toBe(siteSnapshot);
    expect(JSON.stringify(tree)).toBe(treeSnapshot);
    expect(JSON.stringify(event)).toBe(eventSnapshot);
  });

  it("site 가 undefined 이면 site 관련 매핑은 건너뛴다 (이벤트 단독 동기화는 현재 흐름엔 없지만 방어적)", () => {
    const { tree, event } = makeFixture();
    const out = remapToServerIds({
      tree,
      event,
      serverSiteId: "new-site",
      serverTreeId: null,
    });
    expect(out.site).toBeUndefined();
    expect(out.siteRemapped).toBe(false);
  });

  it("tree 가 undefined 이면 site 만 매핑하고 tree/event 는 건드리지 않는다", () => {
    const { site, event } = makeFixture();
    const out = remapToServerIds({
      site,
      event,
      serverSiteId: "new-site",
      serverTreeId: null,
    });
    expect(out.site!.id).toBe("new-site");
    expect(out.tree).toBeUndefined();
    expect(out.event.tree_id).toBe(event.tree_id);
  });
});
