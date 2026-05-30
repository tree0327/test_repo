import { useState, useEffect, useCallback } from 'react';
import { supabase, RECORDS_TABLE } from '../supabaseClient';

// 주 저장소: Supabase. localStorage 는 오프라인 캐시 + 기존 데이터 1회 마이그레이션.
const CACHE_KEY = 'salesData';
const MIGRATION_FLAG = 'salesData_migrated_to_supabase';

// 결제수단별 최종액: 현금=원금, 카드=수수료 10% 차감
function computeFinal(type, original) {
  return type === '현금' ? original : Math.floor(original * 0.9);
}

function readCache() {
  try {
    const item = window.localStorage.getItem(CACHE_KEY);
    return item ? JSON.parse(item) : [];
  } catch (e) {
    console.error('Failed to read sales cache:', e);
    return [];
  }
}

export const useSalesData = () => {
  const [salesData, setSalesData] = useState(readCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 상태 + 로컬 캐시를 함께 갱신
  const persist = useCallback((updater) => {
    setSalesData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to write sales cache:', e);
      }
      return next;
    });
  }, []);

  // 마운트 시 Supabase 에서 전체 기록 로드.
  // DB 가 비어 있고 기존 localStorage 기록이 있으면 1회 업로드(마이그레이션).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: fetchErr } = await supabase
        .from(RECORDS_TABLE)
        .select('*')
        .order('date', { ascending: false });
      if (cancelled) return;

      if (fetchErr) {
        // DB 연결 실패 시 로컬 캐시 유지(폴백)
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      let rows = data ?? [];
      const localRows = readCache();
      const alreadyMigrated = window.localStorage.getItem(MIGRATION_FLAG);

      // 이 기기에 남아 있던 기존 기록을 DB로 1회 적재(병합).
      // DB 상태와 무관하게, id 기준 upsert 로 "로컬에만 있던 기록"을 올린다.
      // (DB에 이미 있는 id 는 ignoreDuplicates 로 건드리지 않음 → 기존 흐름 유지)
      if (localRows.length > 0 && !alreadyMigrated) {
        const toUpsert = localRows.map((r) => {
          const original = Number(r.original) || 0;
          return {
            id: String(r.id),
            type: r.type,
            original,
            final: Number(r.final ?? computeFinal(r.type, original)),
            name: r.name || '',
            date: r.date,
          };
        });
        const { error: upErr } = await supabase
          .from(RECORDS_TABLE)
          .upsert(toUpsert, { onConflict: 'id', ignoreDuplicates: true });
        if (cancelled) return;
        if (upErr) {
          setError(upErr.message);
        } else {
          window.localStorage.setItem(MIGRATION_FLAG, '1');
          // 병합 결과를 반영해 다시 로드
          const { data: reloaded } = await supabase
            .from(RECORDS_TABLE)
            .select('*')
            .order('date', { ascending: false });
          if (cancelled) return;
          rows = reloaded ?? rows;
        }
      }

      setError(null);
      persist(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const addRecord = useCallback(
    async (type, originalAmount, name = '') => {
      const original = Number(originalAmount) || 0;
      const record = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        type,
        original,
        final: computeFinal(type, original),
        name: (name || '').trim(),
        date: new Date().toISOString(),
      };
      // 낙관적 업데이트
      persist((prev) => [record, ...prev]);

      const { error: insErr } = await supabase.from(RECORDS_TABLE).insert(record);
      if (insErr) {
        setError(insErr.message);
        persist((prev) => prev.filter((r) => r.id !== record.id)); // 롤백
      } else {
        setError(null);
      }
    },
    [persist]
  );

  const updateRecord = useCallback(
    async (id, type, newOriginalAmount, name = '') => {
      const original = Number(newOriginalAmount) || 0;
      const patch = {
        type,
        original,
        final: computeFinal(type, original),
        name: (name || '').trim(),
      };
      let snapshot;
      persist((prev) => {
        snapshot = prev;
        return prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      });

      const { error: updErr } = await supabase
        .from(RECORDS_TABLE)
        .update(patch)
        .eq('id', id);
      if (updErr) {
        setError(updErr.message);
        if (snapshot) persist(snapshot); // 롤백
      } else {
        setError(null);
      }
    },
    [persist]
  );

  const deleteRecord = useCallback(
    async (id) => {
      let snapshot;
      persist((prev) => {
        snapshot = prev;
        return prev.filter((r) => r.id !== id);
      });

      const { error: delErr } = await supabase
        .from(RECORDS_TABLE)
        .delete()
        .eq('id', id);
      if (delErr) {
        setError(delErr.message);
        if (snapshot) persist(snapshot); // 롤백
      } else {
        setError(null);
      }
    },
    [persist]
  );

  // 수동 백업: 이 기기 localStorage(+현재 화면) 기록을 모두 DB로 올린다(병합).
  // 자동 1회 마이그레이션과 별개로, 사용자가 직접 눌러 확인할 수 있는 안전장치.
  // 반환: { found, error } — found=발견한 로컬 기록 수, error=실패 메시지(없으면 null)
  const backupLocalToDb = useCallback(async () => {
    // localStorage 와 현재 state 를 합쳐 id 기준 중복 제거(로컬 우선)
    const merged = new Map();
    for (const r of salesData) merged.set(String(r.id), r);
    for (const r of readCache()) merged.set(String(r.id), r);
    const local = [...merged.values()];

    if (local.length === 0) {
      return { found: 0, error: null };
    }

    const toUpsert = local.map((r) => {
      const original = Number(r.original) || 0;
      return {
        id: String(r.id),
        type: r.type,
        original,
        final: Number(r.final ?? computeFinal(r.type, original)),
        name: r.name || '',
        date: r.date,
      };
    });

    // ignoreDuplicates:false → 로컬 내용으로 DB를 최신화(덮어쓰기 병합)
    const { error: upErr } = await supabase
      .from(RECORDS_TABLE)
      .upsert(toUpsert, { onConflict: 'id', ignoreDuplicates: false });

    if (upErr) {
      setError(upErr.message);
      return { found: local.length, error: upErr.message };
    }

    window.localStorage.setItem(MIGRATION_FLAG, '1');

    // 병합 결과로 화면 갱신
    const { data: reloaded } = await supabase
      .from(RECORDS_TABLE)
      .select('*')
      .order('date', { ascending: false });
    if (reloaded) persist(reloaded);
    setError(null);

    return { found: local.length, error: null };
  }, [salesData, persist]);

  return {
    salesData,
    addRecord,
    updateRecord,
    deleteRecord,
    backupLocalToDb,
    loading,
    error,
  };
};
