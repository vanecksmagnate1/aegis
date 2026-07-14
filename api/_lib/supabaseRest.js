const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function headers(extra) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function sbInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`sbInsert ${table} failed: ${res.status} ${await res.text()}`);
}

export async function sbDelete(table, column, value) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`;
  const res = await fetch(url, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
  if (!res.ok) throw new Error(`sbDelete ${table} failed: ${res.status} ${await res.text()}`);
}

export async function sbUpdate(table, column, value, patch) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`sbUpdate ${table} failed: ${res.status} ${await res.text()}`);
}

export async function sbSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`sbSelect ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sbCount(table, selectCol) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${selectCol || 'name'}`, {
    headers: headers({ Prefer: 'count=exact' }),
  });
  if (!res.ok) throw new Error(`sbCount ${table} failed: ${res.status} ${await res.text()}`);
  const range = res.headers.get('content-range') || '0/0';
  return Number(range.split('/')[1]) || 0;
}
