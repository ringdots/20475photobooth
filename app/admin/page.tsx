'use client';
import { useEffect, useState } from 'react';
import Toast from '@/components/Toast';
import { createClient } from '@supabase/supabase-js';


const API_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ADMIN_PASS = process.env.NEXT_PUBLIC_ADMIN_PASS!;

// 🔑 브라우저용 Supabase SDK
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

type ImageRow = {
  id: number;
  file_path: string;        // "photos/xxx.jpg"
  captured_at?: string|null;
  created_at?: string|null;
};
type ImageRowEx = ImageRow & { signedUrl: string };


export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [verified, setVerified] = useState(false);
  const [images, setImages] = useState<any[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);


  useEffect(() => {
    // 브라우저 새로고침 후에도 로그인 유지
    if (localStorage.getItem('admin') === '1') {
      setVerified(true);
      fetchAll();
    }
  }, []);

  async function verifyPassword() {
    if (pass === ADMIN_PASS) {
      localStorage.setItem('admin', '1');
      setVerified(true);
      fetchAll();
    } else {
      alert('비밀번호가 틀렸습니다 ❌');
      setPass('');
    }
  }

  // 🔐 로고용 서명 URL
  async function signedLogo() {
    const { data, error } = await supabase
      .storage.from('photos')
      .createSignedUrl('logo.png', 300); // 5분
    if (error || !data?.signedUrl) {
      setLogo(null);
      return;
    }
    setLogo(data.signedUrl);
  }

  // 🔐 파일 경로 → 서명 URL
  async function signPath(file_path: string, seconds = 3600): Promise<string> {
    const key = file_path.replace(/^photos\//, '');
    const { data, error } = await supabase
      .storage.from('photos')
      .createSignedUrl(key, seconds);
    if (error || !data?.signedUrl) throw error || new Error('No signedUrl');
    return data.signedUrl;
  }

  // 목록 + 로고 동시 로딩
  async function fetchAll() {
    const resImg = await fetch(
      `${SUPABASE_URL}/rest/v1/images?select=*&order=captured_at.desc`,
      { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows: ImageRow[] = await resImg.json();

    const list = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        signedUrl: await signPath(r.file_path, 3600), // 1시간
      }))
    );
    setImages(list);

    await signedLogo();
  }

  // ✅ 로고 업로드: 고정키 + upsert
  async function uploadLogo(file: File) {
    const { error } = await supabase
      .storage.from('photos')
      .upload('logo.png', file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '1',
      });
    if (error) return setToastMsg('로고 업로드 실패: ' + error.message);

    await signedLogo(); // 업로드 직후 서명 URL 갱신
    setToastMsg('로고 변경 완료 ✅');
  }

  // 날짜 수정
  async function updateDate(id: number, newDate: string) {
    if (!newDate) return setToastMsg('날짜를 입력해줘!');
    const res = await fetch('/api/manage-image', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify({ id, captured_at: newDate }),
    });
    const json = await res.json();
    if (json.ok) {
      setToastMsg('수정 완료!');
      fetchAll();
    } else {
      setToastMsg('수정 실패: ' + json.error);
    }
  }


  // 삭제
  async function deleteImage(id: number) {
    if (!confirm('정말 삭제할까요?')) return;
    const res = await fetch(`/api/manage-image?id=${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${API_TOKEN}` },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      setToastMsg('삭제 완료 🎉');
      fetchAll();
    } else {
      setToastMsg('삭제 실패: ' + (json.error || res.statusText));
    }
  }

  function logout() {
    localStorage.removeItem('admin');
    setVerified(false);
    setPass('');
  }

  // 1. 비밀번호 인증 화면
  if (!verified)
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60 }}>
        <h2>관리자 로그인</h2>
        <input
          type="password"
          placeholder="관리자 비밀번호 입력"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 15,
          }}
        />
        <button
          onClick={verifyPassword}
          style={{
            marginTop: 18,
            padding: '10px 20px',
            borderRadius: 8,
            background: '#191919',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          입장
        </button>
      </main>
    );

  // 2. 관리자 대시보드
  return (
    <>
      <main style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>관리자 대시보드</h2>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
            로그아웃
          </button>
        </div>

        <section style={{ marginTop: 30 }}>
          <h3>로고 변경</h3>
          {logo && <img src={logo} style={{ maxWidth: 180 }} />}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files && uploadLogo(e.target.files[0])}
            style={{ display: 'block', marginTop: 10 }}
          />
        </section>

        <section style={{ marginTop: 40 }}>
          <h3>이미지 목록</h3>
          {images.map((img) => (
            <div key={img.id} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={img.signedUrl} style={{ width: 120, borderRadius: 6 }} />
              <input
                type="date"
                defaultValue={img.captured_at?.slice(0, 10)}
                onChange={(e) => updateDate(img.id, e.target.value)}
              />
              <button onClick={() => deleteImage(img.id)}>삭제</button>
            </div>
          ))}
        </section>
      </main>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </>
  );
}
