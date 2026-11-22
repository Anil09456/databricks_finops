/** api/client.js — base fetch wrapper */
const BASE = import.meta.env.DEV ? '' : ''  // same origin in prod

async function apiFetch(path) {
  const res = await fetch(`${BASE}/api${path}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

async function apiDelete(path) {
  const res = await fetch(`${BASE}/api${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`)
  return res.json()
}

export { apiFetch, apiPost, apiDelete }
