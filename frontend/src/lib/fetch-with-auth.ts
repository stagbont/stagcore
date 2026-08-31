const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type FetchWithAuthOptions = RequestInit & { token?: string };

export { API_URL };

export function getAuthToken(
  session: unknown
): string {
  const s = session as { session?: { token?: string } } | null | undefined;
  return s?.session?.token ?? "";
}

export async function fetchWithAuth(
  path: string,
  token: string,
  options: Omit<FetchWithAuthOptions, "token"> = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Only set JSON content-type if body is present and header not already set
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

export async function fetchJsonWithAuth<T>(
  path: string,
  token: string,
  options: Omit<FetchWithAuthOptions, "token"> = {}
): Promise<T> {
  const res = await fetchWithAuth(path, token, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
