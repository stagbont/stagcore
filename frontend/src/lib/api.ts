const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  // Forward session token if available (stored in localStorage by better-auth or cookie)
  // Better Auth stores session in cookie, but we also need to send it to FastAPI
  // FastAPI expects Authorization: Bearer <token>
  // We try to read from document.cookie in browser, or pass explicitly
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  return res;
}

export async function getBusinesses(token: string) {
  const res = await fetch(`${API_URL}/api/v1/business/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
