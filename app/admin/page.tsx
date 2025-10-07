'use client';
import { useEffect, useState } from 'react';

const API_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ADMIN_PASS = process.env.NEXT_PUBLIC_ADMIN_PASS!;

export default function AdminPage() {
  const [pass, setPass] = useState('');
  const [verified, setVerified] = useState(false);
  const [images, setImages] = useState<any[]>([]);
  const [logo, setLogo] = useState<string | null>(null);

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

  async function fetchAll() {
    const resImg = await fetch(`${SUPABASE_URL}/rest/v1/images?select=*`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const resLogo = await fetch(`${SUPABASE_URL}/rest/v1/logo?select=*`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
    });
    setImages(await resImg.json());
    const logos = await resLogo.json();
    setLogo(logos[0]?.file_path || null);
  }

  async function uploadLogo(file: File) {
    const safe = `${Date.now()}_${file.name}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${safe}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: file,
    });
    if (!up.ok) return alert('로고 업로드 실패');

    const db = await fetch('/api/manage-logo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ file_path: `photos/${safe}` }),
    });
    if (!db.ok) return alert('로고 DB 반영 실패');
    alert('로고 변경 완료');
    fetchAll();
  }

  async function deleteImage(id: number) {
    if (!confirm('정말 삭제할까요?')) return;
    const res = await fetch('/api/manage-image', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      alert('삭제 완료');
      fetchAll();
    }
  }

  function logout() {
    localStorage.removeItem('admin');
    setVerified(false);
    setPass('');
  }

  // 1️⃣ 비밀번호 인증 화면
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

  // 2️⃣ 관리자 대시보드
  return (
    <main style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>관리자 대시보드</h2>
        <button onClick={logout} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
          로그아웃
        </button>
      </div>

      <section style={{ marginTop: 30 }}>
        <h3>로고 변경</h3>
        {logo && <img src={`${SUPABASE_URL}/storage/v1/object/public/${logo}`} style={{ maxWidth: 180 }} />}
        <input type="file" accept="image/*" onChange={(e) => e.target.files && uploadLogo(e.target.files[0])} />
      </section>

      <section style={{ marginTop: 40 }}>
        <h3>이미지 목록</h3>
        {images.map((img) => (
          <div key={img.id} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={`${SUPABASE_URL}/storage/v1/object/public/${img.file_path}`}
              style={{ width: 120, borderRadius: 6 }}
            />
            <span>{img.captured_at}</span>
            <button onClick={() => deleteImage(img.id)}>삭제</button>
          </div>
        ))}
      </section>
    </main>
  );
}
