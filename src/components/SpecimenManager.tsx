"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  buildSpecimenTree,
  createSpecimen,
  deleteSpecimen,
  listSpecimensForEvent,
  statusLabel,
  type SpecimenNode,
} from "@/lib/specimens/api";
import { SPECIMEN_TYPES, type SpecimenTypeCode, type Specimen } from "@/types/db";

interface Props {
  eventId: string;
  sampleNo: string;
  canWrite: boolean;
}

export function SpecimenManager({ eventId, sampleNo, canWrite }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addingUnder, setAddingUnder] = useState<string | null | "ROOT">(null);
  const [busy, setBusy] = useState(false);

  const [typeCode, setTypeCode] = useState<SpecimenTypeCode>("D");
  const [description, setDescription] = useState("");
  const [storage, setStorage] = useState("");

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listSpecimensForEvent(eventId));
    } catch (e: any) {
      setErr(e?.message ?? "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const tree = buildSpecimenTree(rows);

  function startAdd(parentId: string | null) {
    setAddingUnder(parentId ?? "ROOT");
    setTypeCode("D");
    setDescription("");
    setStorage("");
    setErr(null);
  }
  function cancelAdd() {
    setAddingUnder(null);
  }

  async function submitAdd() {
    if (addingUnder === null) return;
    setBusy(true);
    setErr(null);
    try {
      await createSpecimen({
        root_event_id: eventId,
        parent_id: addingUnder === "ROOT" ? null : addingUnder,
        type_code: typeCode,
        description: description.trim() || null,
        storage_location: storage.trim() || null,
      });
      setAddingUnder(null);
      await refresh();
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "추가 실패";
      // unique 위반 → 같은 seq 동시 insert
      if (e?.code === "23505") {
        setErr("동시에 같은 번호의 시편이 생성되었습니다. 다시 시도해주세요.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(s: Specimen) {
    if (!confirm(`${s.human_code} 시편을 삭제할까요?\n(자식 시편도 모두 함께 삭제됩니다.)`)) return;
    setBusy(true);
    try {
      await deleteSpecimen(s.id);
      await refresh();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-bold text-brand-700">시편 (Specimens)</h2>
        <div className="flex items-center gap-2 text-xs">
          {rows.length > 0 && (
            <Link
              href={`/specimens/print?event=${eventId}`}
              className="btn-secondary"
              target="_blank"
            >
              🏷 라벨 인쇄
            </Link>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => startAdd(null)}
              className="btn-secondary"
              disabled={busy}
            >
              + 1차 시편 추가
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-stone-500">
        뿌리: <code className="font-mono">{sampleNo}</code> · 사람용 코드는 자동 생성됩니다(예: <code className="font-mono">{sampleNo}.D01.B03.L02</code>).
      </p>

      {err && <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded break-all">{err}</p>}

      {addingUnder === "ROOT" && (
        <SpecimenAddForm
          parentHumanCode={sampleNo}
          typeCode={typeCode}
          setTypeCode={setTypeCode}
          description={description}
          setDescription={setDescription}
          storage={storage}
          setStorage={setStorage}
          busy={busy}
          onCancel={cancelAdd}
          onSubmit={submitAdd}
        />
      )}

      {loading ? (
        <p className="text-xs text-stone-500">불러오는 중…</p>
      ) : tree.length === 0 ? (
        <p className="text-xs text-stone-500">등록된 시편이 없습니다.{canWrite && " 「+ 1차 시편 추가」 로 시작하세요."}</p>
      ) : (
        <ul className="space-y-1.5">
          {tree.map((node) => (
            <SpecimenTreeNode
              key={node.id}
              node={node}
              depth={0}
              canWrite={canWrite}
              addingUnder={addingUnder}
              startAdd={startAdd}
              cancelAdd={cancelAdd}
              handleDelete={handleDelete}
              typeCode={typeCode}
              setTypeCode={setTypeCode}
              description={description}
              setDescription={setDescription}
              storage={storage}
              setStorage={setStorage}
              busy={busy}
              submitAdd={submitAdd}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SpecimenTreeNode({
  node, depth, canWrite, addingUnder,
  startAdd, cancelAdd, handleDelete,
  typeCode, setTypeCode, description, setDescription, storage, setStorage,
  busy, submitAdd,
}: {
  node: SpecimenNode;
  depth: number;
  canWrite: boolean;
  addingUnder: string | null | "ROOT";
  startAdd: (parentId: string | null) => void;
  cancelAdd: () => void;
  handleDelete: (s: Specimen) => void;
  typeCode: SpecimenTypeCode;
  setTypeCode: (c: SpecimenTypeCode) => void;
  description: string;
  setDescription: (s: string) => void;
  storage: string;
  setStorage: (s: string) => void;
  busy: boolean;
  submitAdd: () => void;
}) {
  const t = SPECIMEN_TYPES.find((x) => x.code === node.type_code);
  return (
    <li>
      <div
        className="flex items-center justify-between gap-2 py-1.5 rounded hover:bg-stone-50"
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        <div className="min-w-0 flex-1">
          <Link href={`/specimens/${node.id}`} className="text-sm font-mono text-brand-700 hover:underline">
            {node.human_code}
          </Link>
          <span className="text-xs text-stone-500 ml-2">
            {t?.ko ?? node.specimen_type} ({node.type_code}{String(node.seq_no).padStart(2, "0")})
            {node.status !== "active" && (
              <span className="ml-2 text-rose-700">· {statusLabel(node.status)}</span>
            )}
          </span>
          {(node.description || node.storage_location) && (
            <div className="text-xs text-stone-500 mt-0.5">
              {node.description && <span>{node.description}</span>}
              {node.description && node.storage_location && <span> · </span>}
              {node.storage_location && <span>📍 {node.storage_location}</span>}
            </div>
          )}
        </div>
        {canWrite && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => startAdd(node.id)}
              className="text-[11px] px-1.5 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-stone-100"
              disabled={busy}
              title={`${node.human_code} 의 자식 시편 추가`}
            >
              + 자식
            </button>
            <button
              type="button"
              onClick={() => handleDelete(node)}
              className="text-[11px] px-1.5 py-0.5 rounded text-rose-700 hover:bg-rose-50"
              disabled={busy}
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {addingUnder === node.id && (
        <div style={{ paddingLeft: (depth + 1) * 16 + 4 }}>
          <SpecimenAddForm
            parentHumanCode={node.human_code}
            typeCode={typeCode}
            setTypeCode={setTypeCode}
            description={description}
            setDescription={setDescription}
            storage={storage}
            setStorage={setStorage}
            busy={busy}
            onCancel={cancelAdd}
            onSubmit={submitAdd}
          />
        </div>
      )}

      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <SpecimenTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              canWrite={canWrite}
              addingUnder={addingUnder}
              startAdd={startAdd}
              cancelAdd={cancelAdd}
              handleDelete={handleDelete}
              typeCode={typeCode}
              setTypeCode={setTypeCode}
              description={description}
              setDescription={setDescription}
              storage={storage}
              setStorage={setStorage}
              busy={busy}
              submitAdd={submitAdd}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SpecimenAddForm({
  parentHumanCode,
  typeCode, setTypeCode,
  description, setDescription,
  storage, setStorage,
  busy, onCancel, onSubmit,
}: {
  parentHumanCode: string;
  typeCode: SpecimenTypeCode;
  setTypeCode: (c: SpecimenTypeCode) => void;
  description: string;
  setDescription: (s: string) => void;
  storage: string;
  setStorage: (s: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const t = SPECIMEN_TYPES.find((x) => x.code === typeCode);
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 my-2 space-y-2">
      <div className="text-xs text-stone-600">
        부모: <code className="font-mono">{parentHumanCode}</code> → 새 시편의 사람용 코드는{" "}
        <code className="font-mono">{parentHumanCode}.{typeCode}NN</code> (NN은 자동)
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          종류
          <select
            className="field-value mt-0.5 text-sm"
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value as SpecimenTypeCode)}
          >
            {SPECIMEN_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} · {t.ko} ({t.en})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          보관 위치 (선택)
          <input
            className="field-value mt-0.5 text-sm"
            value={storage}
            onChange={(e) => setStorage(e.target.value)}
            placeholder="냉장고-2, 박스 A, 칸 03"
          />
        </label>
      </div>
      <label className="text-xs block">
        설명 (선택)
        <input
          className="field-value mt-0.5 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t?.description}
        />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary text-xs">
          취소
        </button>
        <button type="button" onClick={onSubmit} disabled={busy} className="btn-primary text-xs">
          {busy ? "추가 중…" : "추가"}
        </button>
      </div>
    </div>
  );
}
