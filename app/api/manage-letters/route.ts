// app/api/manage-letter/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_KEY!; // 서버 전용
const API_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN!;

function auth(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  return token && token === API_TOKEN;
}
function fail(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  // 헬스체크
  return NextResponse.json({ ok: true, ping: 'letters api alive' });
}

export async function PATCH(req: Request) {
  try {
    if (!auth(req)) return fail(401, 'unauthorized');
    if (!SERVICE_ROLE) return fail(500, 'SERVICE_ROLE missing');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { id, written_at, writer } = await req.json();
    if (!id) return fail(400, 'missing id');

    const payload: any = {};
    if (written_at !== undefined) payload.written_at = written_at;
    if (writer !== undefined) payload.writer = writer;

    const { error } = await admin.from('letters').update(payload).eq('id', id);
    if (error) return fail(500, 'update error: ' + error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return fail(500, e?.message || String(e));
  }
}

export async function DELETE(req: Request) {
  try {
    if (!auth(req)) return fail(401, 'unauthorized');
    if (!SERVICE_ROLE) return fail(500, 'SERVICE_ROLE missing');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!id) return fail(400, 'missing id');

    // 1) 행 조회
    const { data: row, error: selErr } = await admin
      .from('letters')
      .select('file_main, file_pages')
      .eq('id', id)
      .single();
    if (selErr) return fail(500, 'select error: ' + selErr.message);

    const file_main: string | undefined = row?.file_main;
    const file_pages: string[] = Array.isArray(row?.file_pages) ? row!.file_pages : [];

    // 2) 스토리지 삭제 (키는 버킷 루트 기준)
    const removeKeys: string[] = [];
    if (file_main) removeKeys.push(file_main.replace(/^photos\//, ''));
    for (const p of file_pages) if (p) removeKeys.push(p.replace(/^photos\//, ''));

    let storageWarn: string | null = null;
    if (removeKeys.length) {
      const { error: delErr } = await admin.storage.from('photos').remove(removeKeys);
      if (delErr) storageWarn = delErr.message;
    }

    // 3) 행 삭제
    const { error: delRowErr } = await admin.from('letters').delete().eq('id', id);
    if (delRowErr) return fail(500, 'delete row error: ' + delRowErr.message);

    // 4) 결과
    return NextResponse.json({ ok: true, warn: storageWarn || undefined });
  } catch (e: any) {
    return fail(500, e?.message || String(e));
  }
}
