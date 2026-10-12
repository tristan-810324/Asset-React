export type AuthUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');
const authTokenKey = 'dyciAuthToken';

export async function apiRequest<T>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, headers: requestHeaders, ...requestOptions } = options;
  const headers = new Headers(requestHeaders);

  if (requestOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = sessionStorage.getItem(authTokenKey);
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...requestOptions, headers });
  } catch {
    throw new ApiError('Hindi makakonekta sa backend. Tiyaking nakaandar ang server sa port 5000.');
  }

  const envelope = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !envelope?.success || envelope.data === undefined) {
    throw new ApiError(
      envelope?.error?.message || 'Hindi naproseso ang request. Subukan muli.',
      response.status,
    );
  }

  return envelope.data;
}

export async function signIn(email: string, password: string) {
  return apiRequest<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser() {
  const result = await apiRequest<{ user: AuthUser }>('/auth/me');
  return result.user;
}

export function saveAuthToken(token: string) {
  sessionStorage.setItem(authTokenKey, token);
}

export function hasAuthToken() {
  return Boolean(sessionStorage.getItem(authTokenKey));
}

export function clearAuthSession() {
  sessionStorage.removeItem(authTokenKey);
}

export function dashboardPathForRoles(roles: string[]) {
  if (roles.includes('IT_ADMIN')) return '/admin';
  if (roles.includes('GSO_STAFF')) return '/gso';
  return null;
}
