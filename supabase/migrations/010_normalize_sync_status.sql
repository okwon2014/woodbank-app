-- 010_normalize_sync_status.sql
-- 목적: 서버에 저장된 sampling_events.sync_status 값을 정규화.
--
-- 배경:
--   sync_status 는 단말(Dexie) 내부 상태를 가리키는 컬럼이다. 단말은
--   야장을 큐에 넣을 때 'queued' 로 마킹하고, 서버 동기화가 끝나면
--   로컬에서 'synced' 로 갱신한다.
--
--   그런데 v?? 까지의 sync worker(`src/lib/sync/worker.ts`)는 큐에 들어 있던
--   payload 를 그대로 서버에 upsert 했기 때문에, 단말이 찍어 둔
--   'queued' 값이 서버 행에 그대로 보존됐다. 서버는 이후 그 값을 갱신할
--   계기가 없어, 화면(`/events`)에서 이미 등록된 야장이 계속 'queued'
--   배지로 보였다.
--
--   동일한 시점에 `markConflict` 도 로컬에서 'conflict' 마킹만 했으므로
--   서버에는 'conflict' 가 흘러가지 않지만, 만약 직접 INSERT/UPDATE 가
--   섞여 들어왔을 가능성을 고려해 함께 정리한다.
--
-- 효과:
--   서버에 남아 있는 'queued' / 'draft' / 'conflict' 행을 'synced' 로
--   일괄 정정한다. 단말 내 Dexie 데이터는 영향 없음(별도 경로).

update sampling_events
   set sync_status = 'synced'
 where sync_status <> 'synced';
