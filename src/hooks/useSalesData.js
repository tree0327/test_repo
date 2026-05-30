import { useState, useEffect, useCallback } from 'react';
import { supabase, RECORDS_TABLE } from '../supabaseClient';

// 주 저장소: Supabase. localStorage 는 오프라인 캐시 + 기존 데이터 1회 마이그레이션.
// id 는 DB가 자동 증가(인덱스 번호)로 생성하므로, 클라이언트는 id 를 만들어 보내지 않는다.
const CACHE_KEY = 'salesData';
const MIGRATION_FLAG = 'salesData_migrated_to_supabase';

// 결제수단별 최종액: 현금=원금, 카드=수수료 10% 차감
function computeFinal(type, original) {
  return type === '현금' ? original : Math.floor(original * 0.9);
}

// localStorage 기록 → DB insert 페이로드(id 제외, DB가 생성)
function toPayload(r) {
  const original = Number(r.original) || 0;
  return {
    type: r.type,
    original,
    final: Number(r.final ?? computeFinal(r.type, original)),
    name: r.name || '',
    date: r.date,
  };
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
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      let rows = data ?? [];
      const localRows = readCache();
      const alreadyMigrated = window.localStorage.getItem(MIGRATION_FLAG);

      if (rows.length === 0 && localRows.length > 0 && !alreadyMigrated) {
        const { data: inserted, error: insErr } = await supabase
          .from(RECORDS_TABLE)
          .insert(localRows.map(toPayload))
          .select();
        if (cancelled) return;
        if (insErr) {
          setError(insErr.message);
        } else {
          window.localStorage.setItem(MIGRATION_FLAG, '1');
          rows = (inserted ?? []).sort((a, b) => new Date(b.date) - new Date(a.date));
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
    async (type, originalAmount, name = '', dateISO = null) => {
      const original = Number(originalAmount) || 0;
      const payload = {
        type,
        original,
        final: computeFinal(type, original),
        name: (name || '').trim(),
        date: dateISO || new Date().toISOString(),
      };
      // DB가 id를 생성하므로 insert 후 반환된 행을 화면에 반영
      const { data, error: insErr } = await supabase
        .from(RECORDS_TABLE)
        .insert(payload)
        .select()
        .single();
      if (insErr) {
        setError(insErr.message);
        return;
      }
      setError(null);
      persist((prev) => [data, ...prev]);
    },
    [persist]
  );

  const updateRecord = useCallback(
    async (id, type, newOriginalAmount, name = '', dateISO = null) => {
      const original = Number(newOriginalAmount) || 0;
      const patch = {
        type,
        original,
        final: computeFinal(type, original),
        name: (name || '').trim(),
      };
      if (dateISO) patch.date = dateISO;
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
        if (snapshot) persist(snapshot);
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
        if (snapshot) persist(snapshot);
      } else {
        setError(null);
      }
    },
    [persist]
  );

  // 수동 백업: 이 기기 localStorage 기록을 DB로 1회 업로드(id 는 DB가 생성).
  // 이미 백업한 기기면 중복 방지를 위해 다시 올리지 않는다.
  const backupLocalToDb = useCallback(async () => {
    if (window.localStorage.getItem(MIGRATION_FLAG)) {
      return { found: 0, error: null, already: true };
    }
    const local = readCache();
    if (local.length === 0) {
      return { found: 0, error: null };
    }
    const { error: insErr } = await supabase
      .from(RECORDS_TABLE)
      .insert(local.map(toPayload));
    if (insErr) {
      setError(insErr.message);
      return { found: local.length, error: insErr.message };
    }
    window.localStorage.setItem(MIGRATION_FLAG, '1');
    const { data: reloaded } = await supabase
      .from(RECORDS_TABLE)
      .select('*')
      .order('date', { ascending: false });
    persist(reloaded ?? []);
    setError(null);
    return { found: local.length, error: null };
  }, [persist]);

  return { salesData, addRecord, updateRecord, deleteRecord, backupLocalToDb, loading, error };
};
