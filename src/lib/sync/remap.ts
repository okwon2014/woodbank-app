// 동기화 워커에서 site / tree 의 server-side id 를 lookup 한 뒤,
// payload(site, tree, event) 전체에서 그 id 로 일관되게 매핑해주는 순수 함수.
//
// 배경(글로벌 마스터 정책):
//   - sites.code, (trees.site_id, trees.tree_local_no) 는 unique.
//   - 단말이 새 야장을 만들 때마다 site/tree 의 uuid 를 새로 발급한다
//     (EventForm.tsx). 그래서 같은 site code 라도 단말마다 다른 uuid 가 생긴다.
//   - 동기화 시점에 서버에 이미 같은 code 의 site 가 있다면 → server id 를
//     차용해 우리 payload 의 site.id, tree.site_id 까지 모두 다시 묶어야
//     unique 충돌(`sites_code_key`) 을 피할 수 있다. tree 도 동일.
//
// event.id 는 절대 바꾸지 않는다 — markSynced 의 payload_id 일치, photos.event_id
// 일치(FK) 모두 그 id 기준이라 어긋나면 사진이 영원히 orphan 으로 남는다.
//
// 워커가 lookup 결과를 어떻게 얻든(Supabase, fake, mock) 상관없도록 이 함수는
// 단지 "server id 후보" 두 개를 받아 매핑만 수행한다. 테스트하기 쉽다.
import type { SamplingEvent, Site, Tree } from "@/types/db";

export interface RemapInput {
  site?: Site;
  tree?: Tree;
  event: SamplingEvent;
  /**
   * 서버에서 `select id from sites where code = payload.site.code` 로 얻은 id.
   * `null` 이면 서버에 동일 code 가 없음 → 우리 payload 의 id 그대로 신규 insert.
   */
  serverSiteId: string | null;
  /**
   * 서버에서 `select id from trees where site_id=? and tree_local_no=?` 로 얻은 id.
   * `null` 이면 신규.
   */
  serverTreeId: string | null;
}

export interface RemapOutput {
  site?: Site;
  tree?: Tree;
  event: SamplingEvent;
  /** 호출자가 로그/디버그용으로 사용. true 면 우리 단말의 임시 uuid 와 server uuid 가 달랐다는 뜻. */
  siteRemapped: boolean;
  treeRemapped: boolean;
}

export function remapToServerIds(input: RemapInput): RemapOutput {
  let { site, tree, event } = input;
  let siteRemapped = false;
  let treeRemapped = false;

  if (input.serverSiteId && site && input.serverSiteId !== site.id) {
    const newId = input.serverSiteId;
    site = { ...site, id: newId };
    if (tree) tree = { ...tree, site_id: newId };
    siteRemapped = true;
  }
  if (input.serverTreeId && tree && input.serverTreeId !== tree.id) {
    const newId = input.serverTreeId;
    tree = { ...tree, id: newId };
    event = { ...event, tree_id: newId };
    treeRemapped = true;
  }

  return { site, tree, event, siteRemapped, treeRemapped };
}
