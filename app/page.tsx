'use client';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseClient } from '../lib/supabase';

import BackToTop from '../components/back-to-top';


/* ---------------- types & utils ---------------- */
type Row = {
  id: number;
  file_path: string;
  created_at?: string | null;
  captured_at?: string | null;
};

type RowEx = Row & { signedUrl: string };

function toKDate(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function toSafeKey(name: string) {
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : '';
  const ascii = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${ascii.slice(0, 80) || 'file'}${ext.toLowerCase()}`;
}

/* 🔐 비공개 버킷용 signed URL 생성 */
async function signPath(file_path: string, seconds = 3600): Promise<string> {
  const key = file_path.replace(/^photos\//, '');
  const { data, error } = await supabaseClient.storage
    .from('photos')
    .createSignedUrl(key, seconds);

  if (error) throw error;
  if (!data || !data.signedUrl) throw new Error('No signedUrl returned');
  return data.signedUrl;
}



/* ---------------- page ---------------- */
export default function Page() {
  const [items, setItems] = useState<RowEx[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; captured_at?: string | null } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLogo();
    refresh();
  }, []);

  async function loadLogo() {
    const { data, error } = await supabaseClient.storage
      .from('photos')
      .createSignedUrl('logo.png', 300);
     if (error || !data?.signedUrl) {
        setLogoUrl('');
        return;
      }
    setLogoUrl(data.signedUrl);
  }

  async function onUploadLogo(f: File) {
    const { error } = await supabaseClient.storage.from('photos').upload('logo.png', f, {
      upsert: true,
      contentType: f.type,
      cacheControl: '1'
    });
    if (error) return alert('로고 업로드 실패: ' + error.message);
    loadLogo();
  }

  async function refresh() {
    const { data } = await supabaseClient
      .from('images')
      .select('*')
      .order('captured_at', { ascending: false });

    const rows = data ?? [];

    // 각 row.file_path → signed URL 생성
    const withSigned = await Promise.all(
      rows.map(async (r) => {
        const url = await signPath(r.file_path, 3600); // 1시간짜리
        return { ...r, signedUrl: url };
      })
    );

    setItems(withSigned as RowEx[]); // 타입 간단히 처리 (아래 카드 매핑에서 씀)
  }

  // function publicUrlFromPath(file_path: string) {
  //   const key = file_path.replace(/^photos\//, '');
  //   const { data } = supabaseClient.storage.from('photos').getPublicUrl(key);
  //   return data.publicUrl;
  // }


  const cards = useMemo(
    () =>
      items.map((r) => ({
        ...r,
        url: r.signedUrl,
        dateLabel: toKDate(r.captured_at || r.created_at),
      })),
    [items]
  );

  return (
    <>
      <main className="wrap">
        {/* 상단 로고 영역 (시안의 점선 박스 위치/여백만 유지, 실제 점선 X) */}
        <section className="logoBox" onClick={() => logoInputRef.current?.click()}>
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="logoImg" />
          ) : (
            <div className="logoPlaceholder">logo images</div>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadLogo(f);
            }}
          />
        </section>

        {/* 가운데 단독 + 아이콘 (시안처럼) */}
        <button className="plusBtn" aria-label="add" onClick={() => setOpenAdd(true)}>
          +
        </button>

        {/* Masonry 갤러리 */}
        <section className="masonry">
          {cards.map((c) => (
            <article key={c.id} className="tile" onClick={() => setViewer({ url: c.url, captured_at: c.captured_at })}>
              <img src={c.url} alt="" className="tileImg" />
              <div className="tileMask">
                <span className="tileDate">{c.dateLabel}</span>
              </div>
            </article>
          ))}
        </section>
      </main>

      {/* 추가 모달 (파일+날짜, 캘린더는 클릭시 열림) */}
      {openAdd && (
        <AddModal
          onClose={() => setOpenAdd(false)}
          onSaved={async () => {
            setOpenAdd(false);
            await refresh();
          }}
        />
      )}

      {/* 이미지 전체화면 모달 (이미지/외부 클릭 닫힘) */}
      {viewer && (
        <Modal onClose={() => setViewer(null)}>
          <div className="viewer" onClick={() => setViewer(null)}>
            <img src={viewer.url} alt="" />
            {viewer.captured_at && <div className="viewerDate">{toKDate(viewer.captured_at)}</div>}
          </div>
        </Modal>
      )}

      <BackToTop />

      {/* styles */}
      <style jsx>{`
        :global(html, body) {
          margin: 0;
          background: #ffffff;
          color: #111;
          font-family: ui-sans-serif, system-ui, -apple-system, 'Noto Sans KR', Segoe UI, Roboto, Helvetica, Arial;
        }

        /* 모바일 최적화 + 데스크톱 중앙정렬 */
        .wrap {
          max-width: 760px;
          margin: 0 auto;
          padding: 28px 16px 80px;
        }

        /* — 상단 로고 — */
        .logoBox {
          margin: 18px auto 24px;
          width: min(420px, 86vw);
          min-height: 90px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #fff;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .logoImg {
          max-width: 240px;   /* “적절한 로고 사이즈” */
          max-height: 80px;
          object-fit: contain;
          display: block;
        }
        .logoPlaceholder { font-size: 20px; color: #444; }
        .hidden { display: none; }

        /* — 중앙 단독 + — */
        .plusBtn {
          display: block;
          margin: 4px auto 100px;
          width: 32px; height: 32px;
          border-radius: 50%;
          border: 1px solid #e5e5e5;
          background: #fff;
          font-size: 22px;
          line-height: 30px;
          text-align: center;
          cursor: pointer;
        }
        .plusBtn:hover { background: #f7f7f7; }

        /* — Masonry (이미지 비율 유지 + 자연스러운 스택) — */
        .masonry {
          column-count: 2;
          column-gap: 16px;
        }
        @media (min-width: 560px) { .masonry { column-count: 3; } }
        .tile {
          position: relative;
          margin: 0 0 16px;
          break-inside: avoid;
          cursor: pointer;
        }
        .tileImg {
          width: 100%;
          height: auto;
          display: block;
          background: #f5f5f5;
          border: 1px solid #eee;
        }
        /* hover 마스킹 + 중앙 날짜 */
        .tileMask {
          position: absolute; inset: 0;
          display: grid; place-items: center;
          background: rgba(0,0,0,0.0);
          opacity: 0; transition: .18s ease;
        }
        .tile:hover .tileMask { opacity: 1; background: rgba(0,0,0,0.28); }
        .tileDate { color: #fff; font-size: 12px; letter-spacing: .2px; }

        /* — 모달 공통 (오버레이 마스킹) — */
        .backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.55);
          display: grid; place-items: center;
          padding: 18px; z-index: 50;
        }
        .card {
          width: min(520px, 96vw);
          max-height: 90vh; overflow: auto;
          background: #fff; border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,.18);
          position: relative;
        }
        .closeX {
          position: absolute; right: 14px; top: 12px;
          width: 28px; height: 28px; border-radius: 50%;
          border: 1px solid #e5e5e5; background: #fff;
          font-size: 18px; line-height: 26px; text-align: center; cursor: pointer;
        }

        /* — 뷰어 — */
        .viewer { position: relative; display: grid; place-items: center; max-height: 90vh; max-width: 100vw; overflow: hidden;}
        .viewer img { max-width: 100%; max-height: 88vh; object-fit: contain; width: auto; height: auto; display: block; }
        .viewerDate {
          position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
          color: #fff; font-size: 12px; padding: 4px 8px; border-radius: 6px; background: rgba(0,0,0,.35);
        }
      `}</style>
    </>
  );
}

/* ---------------- Add Modal ---------------- */
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
  }

  async function save() {
    if (!file) return alert('이미지를 첨부해줘!');
    setSaving(true);
    try {
      const safe = toSafeKey(file.name);
      const key = `${Date.now()}_${safe}`;
      const { error: upErr } = await supabaseClient.storage.from('photos').upload(key, file, {
        contentType: file.type,
      });
      if (upErr) throw upErr;

      const payload: any = { file_path: `photos/${key}` };
      if (date) payload.captured_at = date;
      const { error: dbErr } = await supabaseClient.from('images').insert(payload);
      if (dbErr) throw dbErr;

      onSaved();
    } catch (e: any) {
      alert('저장 실패: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="addWrap" onClick={(e) => e.stopPropagation()}>
        {/* 2-1. 닫기 버튼 우상단 */}
        <button className="closeX" onClick={onClose} aria-label="close">×</button>

        {/* 프리뷰 (클릭 시 재첨부) */}
        <div className="preview" onClick={() => fileRef.current?.click()}>
          {preview ? <img src={preview} alt="preview" /> : <span>+ 새로운 추억</span>}
        </div>

        <label className="field">
          <span className="label">-</span>
          <input ref={fileRef} type="file" accept="image/*" onChange={pick} />
        </label>

        <label className="field">
          <span className="label">추억이 생긴 날</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {/* 2-2. 텍스트 버튼(이탤릭) + 색상 */}
        <div className="actions">
          <button className="textBtn later" type="button" onClick={onClose}>
            <em>다음에</em>
          </button>
          <button className="textBtn add" type="button" onClick={save} disabled={!file || !date || saving}>
            <em>{saving ? '추가 중…' : '추가'}</em>
          </button>
        </div>
      </div>

      <style jsx>{`
        .addWrap { position: relative; padding: 22px 16px 16px; }
        .closeX {
          position: absolute; right: 14px; top: 12px;
          width: 28px; height: 28px; border-radius: 50%;
          border: 1px solid #e5e5e5; background: #fff;
          font-size: 18px; line-height: 26px; text-align: center; cursor: pointer;
        }
        .preview {
          width: 240px; height: 240px; margin: 10px auto 12px;
          border-radius: 12px; background: #f5f5f5; overflow: hidden;
          display: grid; place-items: center; cursor: pointer;
        }
        .preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .field { display: grid; gap: 6px; margin: 12px 0; }
        .label { font-size: 12px; color: #666; }
        input[type='file'], input[type='date'] {
          border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px;
        }

        /* 텍스트 버튼 스타일 */
        .actions { display: flex; justify-content: center; gap: 18px; margin-top: 50px; margin-bottom: 30px;}
        .textBtn {
          background: transparent;
          border: none;
          padding: 6px 2px;
          cursor: pointer;
          font: inherit;
        }
        .textBtn em { font-style: italic; }
        .textBtn.later { color: #7a7a7a; }
        .textBtn.add { color: #191919; text-decoration: underline; text-underline-offset: 2px; }
        .textBtn[disabled] { opacity: .6; cursor: default; text-decoration: none; }
      `}</style>
    </Modal>
  );
}


function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const prev = document.body.style.overflow;
    if (locked) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}


function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  if (typeof window === 'undefined') return null;

  const node = (
    <div className="__modalBackdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="__modalCard" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>

      <style jsx global>{`
        .__modalBackdrop {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100dvh;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
            max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
          z-index: 9999;
          overflow: auto;
        }
        .__modalCard {
          width: min(520px, 96vw);
          max-height: min(90vh, 90dvh);
          overflow: auto;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
          position: relative;
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}
