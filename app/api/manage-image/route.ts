import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // server-only
);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN!;

function authFail() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function DELETE(req: Request) {
  const auth = req.headers.get('authorization') || '';
    if (!auth) {
        return NextResponse.json({ error: 'no auth header' }, { status: 401 });
    }
    if (!auth.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'no bearer token' }, { status: 401 });
    }
    if (auth !== `Bearer ${ADMIN_TOKEN}`) {
        return NextResponse.json({ error: 'bad token' }, { status: 401 });
    }

  // id를 쿼리스트링 또는 body에서 모두 수용
  const url = new URL(req.url);
  let idStr = url.searchParams.get('id');
  let id = idStr ? Number(idStr) : undefined;
  if (!id) {
    try {
      const j = await req.json();
      if (j?.id) id = Number(j.id);
    } catch {
      /* body 없는 DELETE 허용 */
    }
  }
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  // 파일 경로 미리 조회
  const { data: row, error: selErr } = await supabase
    .from('images')
    .select('id,file_path')
    .eq('id', id)
    .single();

  if (selErr || !row) {
    return NextResponse.json({ error: selErr?.message || 'not found' }, { status: 404 });
  }

  // DB 삭제
  const { error: delErr } = await supabase.from('images').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 스토리지 삭제(선택) — 남겨두고 싶으면 이 블록 주석처리
  if (row.file_path) {
    const key = row.file_path.replace(/^photos\//, '');
    await supabase.storage.from('photos').remove([key]);
  }

  return NextResponse.json({ ok: true });
}
