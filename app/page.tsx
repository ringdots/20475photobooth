'use client';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { supabaseClient } from '../lib/supabase';

import EXIF from 'exif-js';
import BackToTop from '../components/back-to-top';


/* ---------------- types & utils ---------------- */
type Row = {
  id: number;
  file_path: string;
  created_at?: string | null;
  captured_at?: string | null;
};

type RowEx = Row & { signedUrl: string };

// letters 테이블 row 타입
type LetterRow = {
  id: number;
  file_main: string;      // photos/...
  file_pages: string[];   // photos/... 배열
  written_at?: string | null;
  writer?: string | null;
  created_at?: string | null;
};

type ViewerPhoto = { type: 'photo'; url: string; date?: string | null };
type ViewerLetter = { type: 'letter'; images: string[]; date?: string | null };
type ViewerState = ViewerPhoto | ViewerLetter | null;

// 갤러리 카드 공통 (photo + letters 혼합)
type Card =
  | {
      kind: 'photo';
      id: number;
      url: string;           // 썸네일
      hoverUrl?: string;     // (photo는 없음)
      dateLabel: string;
      dateRaw?: string | null;
    }
  | {
      kind: 'letter';
      id: number;
      url: string;           // 썸네일: file_main
      hoverUrl?: string;     // 호버: file_pages[0] (있을 때)
      images: string[];      // 모달 캐러셀용: [file_main, ...file_pages]
      dateLabel: string;     // written_at 포맷
      dateRaw?: string | null;
    };


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

// EXIF '2025:10:08 13:22:00' → '2025-10-08'
function exifToISODate(raw?: string): string | '' {
  if (!raw) return '';
  const ymd = raw.split(' ')[0]?.replace(/:/g, '-') ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : '';
}

// Date → 'YYYY-MM-DD' (EXIF 없을 때 파일 수정시간으로 대체)
function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}



/* ---------------- page ---------------- */
export default function Page() {
  const [items, setItems] = useState<RowEx[]>([]);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [viewer, setViewer] = useState<ViewerState>(null);

  const [logoUrl, setLogoUrl] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
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
    // 1) images (기존)
    const { data: imageRows } = await supabaseClient
      .from('images')
      .select('*')
      .order('captured_at', { ascending: false });

    const rows = (imageRows ?? []) as Row[];
    const withSigned = await Promise.all(
      rows.map(async (r) => {
        const url = await signPath(r.file_path, 3600);
        return { ...r, signedUrl: url } as RowEx;
      })
    );
    setItems(withSigned);

    // 2) letters (신규)
    const { data: letterRows, error: lerr } = await supabaseClient
      .from('letters')
      .select('*')
      .order('written_at', { ascending: false });
    if (lerr) {
      console.warn('letters load error', lerr);
      setLetters([]);
    } else {
      setLetters(letterRows as LetterRow[]);
    }

    // 3) cards 만들기 (두 소스 합치고 날짜 기준 정렬)
    const imageCards: Card[] = withSigned.map((r) => ({
      kind: 'photo',
      id: r.id,
      url: r.signedUrl,
      dateLabel: toKDate(r.captured_at || r.created_at),
      dateRaw: r.captured_at || r.created_at,
    }));

    const letterCards: Card[] = await Promise.all(
      (letterRows ?? []).map(async (lr) => {
        // main + pages 모두 signed URL로 변환
        const mainUrl = await signPath(lr.file_main, 3600);
        const pageUrls = await Promise.all((lr.file_pages ?? []).map((p) => signPath(p, 3600)));

        return {
          kind: 'letter',
          id: lr.id,
          url: mainUrl,                              // 썸네일
          hoverUrl: pageUrls[0] || undefined,        // 호버 시 바꿔치기
          images: [mainUrl, ...pageUrls],            // 캐러셀
          dateLabel: toKDate(lr.written_at || lr.created_at),
          dateRaw: lr.written_at || lr.created_at,
        } as Card;
      })
    );

    // 날짜 내림차순 정렬 (dateRaw 기준)
    const merged = [...imageCards, ...letterCards].sort((a, b) => {
      const da = new Date(a.dateRaw || 0).getTime();
      const db = new Date(b.dateRaw || 0).getTime();
      return db - da;
    });

    setCards(merged);
  }


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
            <article
              key={`${c.kind}-${c.id}`}
              className="tile"
              onClick={() => {
                if (c.kind === 'photo') {
                  setViewer({ type: 'photo', url: c.url, date: c.dateRaw });
                } else {
                  setViewer({ type: 'letter', images: c.images, date: c.dateRaw });
                }
              }}
            >
              {/* 로딩 스피너 */}
              <div className="loaderWrap">
                <div className="loader" />
              </div>

              {/* 기본 썸네일 */}
              <img
                src={c.url}
                alt=""
                className="tileImg baseImg"
                style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  const wrapper = target.previousElementSibling as HTMLElement | null;
                  target.style.opacity = '1';
                  if (wrapper) wrapper.style.display = 'none';
                }}
              />

              {/* 호버 이미지 (letters만 있을 수 있음) */}
              {c.kind === 'letter' && c.hoverUrl && (
                <img
                  src={c.hoverUrl}
                  alt=""
                  className="tileImg hoverImg"
                  style={{ opacity: 0 }}
                  onLoad={(e) => {
                    // 호버 이미지는 미리 로딩만, 기본은 투명
                    // (별도 처리 불필요)
                  }}
                />
              )}

              {/* 마스킹 + 날짜 (기존과 동일 스타일) */}
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
          {viewer.type === 'photo' ? (
            <div className="viewer" onClick={() => setViewer(null)}>
              <img src={viewer.url} alt="" />
              {viewer.date && <div className="viewerDate">{toKDate(viewer.date)}</div>}
            </div>
          ) : (
            <LetterCarousel images={viewer.images} date={viewer.date} onClose={() => setViewer(null)} />
          )}
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
        /* ✅ 마스크가 항상 최상단으로 오게 */
        .tileMask {
          position: absolute; inset: 0;
          display: grid; place-items: center;
          background: rgba(0,0,0,0.0);
          opacity: 0; transition: .18s ease;
          z-index: 3;                 /* 핵심! */
        }

        /* hover 시: 마스크 & 이미지 전환 */
        .tile:hover .tileMask { opacity: 1; background: rgba(0,0,0,.28); }
        .tile:hover .hoverImg { opacity: 1; }
        .tile:hover .baseImg  { opacity: 0; }

        .tileDate { color: #ffffffff; } 

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

        /* 로딩 스피너 */
        .loaderWrap {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: #f5f5f5;
          border-radius: 6px;
          border: 1px solid #eee;
        }
        .loader {
          width: 24px;
          height: 24px;
          border: 3px solid #ddd;
          border-top-color: #999;
          border-radius: 50%;
          animation: spin 1.5s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* 두 장 겹쳐서 호버 시 전환 */
        .baseImg {
          position: relative;
          z-index: 1;
          transition: opacity .18s ease;
        }
        .hoverImg {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          z-index: 2;
          opacity: 0;                 /* 초깃값 명시 */
          transition: opacity .18s ease;
          pointer-events: none;       /* hover 레이어가 마우스 이벤트 막지 않도록 */
        }
        /* 타일 호버 시 hoverImg만 보이게 */
        .tile:hover .hoverImg { opacity: 1; }

      `}</style>
    </>
  );
}

/* ---------------- Add Modal (UI 개편: category select) ---------------- */
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  type Category = 'frame' | 'letters';

  const [category, setCategory] = useState<Category>('frame'); // 디폴트 frame
  const [date, setDate] = useState('');

  // frame 전용
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');

  // letters 전용
  const [file1, setFile1] = useState<File | null>(null);
  const [files2, setFiles2] = useState<File[]>([]);
  const [author, setAuthor] = useState<'nuri_to_jang' | 'jang_to_nuri' | ''>('');

  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const file1Ref = useRef<HTMLInputElement>(null);
  const file2Ref = useRef<HTMLInputElement>(null);

  function toYMDFromExif(dateTimeOriginal: string): string {
    const part = dateTimeOriginal.split(' ')[0] || '';
    return part.replace(/:/g, '-');
  }

  // 공통: 파일에서 EXIF → date 채우기 (frame/letters 모두 활용)
  async function hydrateDateFromFile(f?: File | null) {
    if (!f) return setDate('');
    try {
      const buf = await f.arrayBuffer();
      const tags: any = EXIF.readFromBinaryFile(buf);
      const raw: string | undefined =
        tags?.DateTimeOriginal || tags?.CreateDate || tags?.DateTime;
      let iso = exifToISODate(raw);
      if (!iso) iso = dateToISO(new Date(f.lastModified));
      setDate(iso);
    } catch (err) {
      console.warn('EXIF 파싱 실패:', err);
      setDate('');
    }
  }

  /* ---------------- 파일 선택 핸들러 ---------------- */
  function pickFrame(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
    hydrateDateFromFile(f);
  }

  function pickLetter1(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile1(f);
    // 첫 번째 편지 선택 시 우선 date 유추
    if (f) hydrateDateFromFile(f);
  }

  function pickLetter2Multi(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles2(list);
  }

  /* ---------------- 저장 (지금은 frame만 실제 저장) ---------------- */
    async function save() {
      setSaving(true);
      try {
        if (category === 'frame') {
          // ✅ 기존 frame 저장 그대로
          if (!file) throw new Error('이미지를 첨부해줘!');
          if (!date) throw new Error('날짜를 선택해줘!');

          const safe = toSafeKey(file.name);
          const key = `${Date.now()}_${safe}`;
          const up1 = await supabaseClient.storage.from('photos').upload(key, file, {
            contentType: file.type,
          });
          if (up1.error) throw up1.error;

          const payload: any = {
            file_path: `photos/${key}`,
            ...(date ? { captured_at: date } : {}),
          };
          const ins = await supabaseClient.from('images').insert(payload);
          if (ins.error) throw ins.error;

          onSaved();
          return;
        }

        // ✅ letters 저장 로직
        if (category === 'letters') {
          if (!file1) throw new Error('편지 스캔 1을 첨부해줘!');
          if (!files2 || files2.length === 0) throw new Error('편지 스캔 2를 최소 1장 이상 첨부해줘!');
          if (!date) throw new Error('날짜를 선택해줘!');
          if (!author) throw new Error('누가 누구에게를 선택해줘!');

          // 1) 업로드: main(단일) + pages(다중)
          const mainKey = `${Date.now()}_main_${toSafeKey(file1.name)}`;
          const upMain = await supabaseClient.storage.from('photos').upload(mainKey, file1, {
            contentType: file1.type,
          });
          if (upMain.error) throw upMain.error;

          const pageKeys: string[] = [];
          for (const f of files2) {
            const k = `${Date.now()}_page_${toSafeKey(f.name)}`;
            const up = await supabaseClient.storage.from('photos').upload(k, f, {
              contentType: f.type,
            });
            if (up.error) throw up.error;
            pageKeys.push(`photos/${k}`);
          }

          // 2) DB insert (letters)
          const payload = {
            file_main: `photos/${mainKey}`,
            file_pages: pageKeys,            // ← text[] 로 저장
            written_at: date,                // 'YYYY-MM-DD'
            writer: author,                  // 'nuri_to_jang' | 'jang_to_nuri'
          };
          const ins = await supabaseClient.from('letters').insert(payload);
          if (ins.error) throw ins.error;

          onSaved();
          return;
        }
      } catch (e: any) {
        alert('저장 실패: ' + (e?.message || e));
      } finally {
        setSaving(false);
      }
    }


  return (
    <Modal onClose={onClose}>
      <div className="addWrap" onClick={(e) => e.stopPropagation()}>
        <button className="closeX" onClick={onClose} aria-label="close">×</button>

        {/* 1) 카테고리 셀렉트 (맨 위) */}
        <label className="field">
          <span className="label">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="select"
          >
            <option value="frame">frame</option>
            <option value="letters">letters</option>
          </select>
        </label>

        {/* 2) 카테고리별 인풋 */}
        {category === 'frame' && (
          <>
            {/* 프리뷰 (클릭 시 재첨부) */}
            <div className="preview" onClick={() => fileRef.current?.click()}>
              {preview ? <img src={preview} alt="preview" /> : <span>+ 새로운 추억</span>}
            </div>

            <label className="field">
              <span className="label">파일 첨부</span>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickFrame} />
            </label>

            <label className="field">
              <span className="label">추억이 생긴 날</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </>
        )}

        {category === 'letters' && (
          <>
            <label className="field">
              <span className="label">편지 스캔 1</span>
              <input ref={file1Ref} type="file" accept="image/*" onChange={pickLetter1} />
            </label>

            <label className="field">
              <span className="label">편지 스캔 2 (여러 장 가능)</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={pickLetter2Multi}
              />
              {files2.length > 0 && (
                <small style={{ color: '#666' }}>
                  {files2.length}개 선택됨
                </small>
              )}
            </label>

            <label className="field">
              <span className="label">날짜</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <label className="field">
              <span className="label">누가 누구에게</span>
              <select
                value={author}
                onChange={(e) => setAuthor(e.target.value as any)}
                className="select"
              >
                <option value="">선택</option>
                <option value="nuri_to_jang">누리가 장욱이에게</option>
                <option value="jang_to_nuri">장욱이가 누리에게</option>
              </select>
            </label>
          </>
        )}


        <div className="actions">
          <button className="textBtn later" type="button" onClick={onClose}>
            <em>다음에</em>
          </button>
          <button
            className="textBtn add"
            type="button"
            onClick={save}
            disabled={
              saving ||
              (category === 'frame' && (!file || !date)) ||
              (category === 'letters' && (!file1 || files2.length === 0 || !date || !author))
            }
          >
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

        .field { display: grid; gap: 6px; margin: 12px 0; }
        .label { font-size: 12px; color: #666; }
        .select { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; }

        .preview {
          width: 240px; height: 240px; margin: 10px auto 12px;
          border-radius: 12px; background: #f5f5f5; overflow: hidden;
          display: grid; place-items: center; cursor: pointer;
        }
        .preview img { width: 100%; height: 100%; object-fit: cover; display: block; }

        input[type='file'], input[type='date'] {
          border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px;
        }

        .actions { display: flex; justify-content: center; gap: 18px; margin-top: 36px; margin-bottom: 30px; }
        .textBtn { background: transparent; border: none; padding: 6px 2px; cursor: pointer; font: inherit; }
        .textBtn em { font-style: italic; }
        .textBtn.later { color: #7a7a7a; }
        .textBtn.add { color: #191919; text-decoration: underline; text-underline-offset: 2px; }
        .textBtn[disabled] { opacity: .6; cursor: default; text-decoration: none; }

        /* 선택된 파일 개수 뱃지 느낌 */
        small { display:block; margin-top:6px; font-size:12px; }
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
        /* ✅ viewer가 들어오는 모달은 카드 스킨 제거 */
        .__modalCard:has(.viewer) {
          background: transparent;
          box-shadow: none;
          border-radius: 0;
          width: min(96vw, 1200px);
          max-height: none;
          overflow: visible;        /* 버튼/도트가 잘리지 않게 */
          display: grid;
          place-items: center;
        }

      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

function LetterCarousel({
  images,
  date,
  onClose,
}: {
  images: string[];
  date?: string | null;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const total = images.length;

  function prev(e: React.MouseEvent) {
    e.stopPropagation();
    setIdx((p) => (p - 1 + total) % total);
  }
  function next(e: React.MouseEvent) {
    e.stopPropagation();
    setIdx((p) => (p + 1) % total);
  }

  return (
    <div className="viewer" onClick={onClose}>
      <img src={images[idx]} alt={`page-${idx + 1}`} />
      {date && <div className="viewerDate">{toKDate(date)}</div>}

      {/* 좌우 버튼 */}
      {total > 1 && (
        <>
          <button className="navBtn left" onClick={prev} aria-label="prev">‹</button>
          <button className="navBtn right" onClick={next} aria-label="next">›</button>
          <div className="dots">
            {images.map((_, i) => (
              <span key={i} className={`dot ${i === idx ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setIdx(i); }} />
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .navBtn {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 36px; height: 36px; border-radius: 50%;
          border: 1px solid #e5e5e5; background: rgba(255,255,255,.9);
          font-size: 22px; line-height: 34px; text-align: center; cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,.12);
        }
        .navBtn.left { left: 14px; }
        .navBtn.right { right: 14px; }

        .dots {
          position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
          display: flex; gap: 6px;
        }
        .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: rgba(255,255,255,.6); border: 1px solid rgba(0,0,0,.2);
          cursor: pointer;
        }
        .dot.on { background: #fff; }
      `}</style>
    </div>
  );
}


