export type AuthUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

export type PendingEmailVerification = {
  requiresEmailVerification: true;
  challengeId: string;
  email: string;
  message?: string;
};

export type PendingPasswordReset = {
  challengeId: string;
  email: string;
};

export type SignInResult =
  | PendingEmailVerification
  | { token: string; user: AuthUser };

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');
const authTokenKey = 'dyciAuthToken';
const pendingEmailVerificationKey = 'dyciPendingEmailVerification';
const pendingPasswordResetKey = 'dyciPendingPasswordReset';
const passwordResetTokenKey = 'dyciPasswordResetToken';

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
  return apiRequest<SignInResult>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyEmailOtp(challengeId: string, otp: string) {
  return apiRequest<{ token: string; user: AuthUser }>('/auth/verify-email-otp', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ challengeId, otp }),
  });
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ message: string; challengeId: string }>('/auth/forgot-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email }),
  });
}

export async function verifyPasswordResetOtp(challengeId: string, otp: string) {
  return apiRequest<{ resetToken: string }>('/auth/verify-otp', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ challengeId, otp }),
  });
}

export async function finishPasswordReset(resetToken: string, password: string) {
  return apiRequest<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ resetToken, password }),
  });
}

export function savePendingPasswordReset(pending: PendingPasswordReset) {
  sessionStorage.setItem(pendingPasswordResetKey, JSON.stringify(pending));
}

export function getPendingPasswordReset(): PendingPasswordReset | null {
  const value = sessionStorage.getItem(pendingPasswordResetKey);
  if (!value) return null;

  try {
    const pending = JSON.parse(value) as Partial<PendingPasswordReset>;
    if (typeof pending.challengeId === 'string' && typeof pending.email === 'string') {
      return pending as PendingPasswordReset;
    }
  } catch {
    sessionStorage.removeItem(pendingPasswordResetKey);
  }

  return null;
}

export function savePasswordResetToken(token: string) {
  sessionStorage.setItem(passwordResetTokenKey, token);
}

export function getPasswordResetToken() {
  const token = sessionStorage.getItem(passwordResetTokenKey);
  return token && token.length >= 32 ? token : null;
}

export function clearPasswordResetState() {
  sessionStorage.removeItem(pendingPasswordResetKey);
  sessionStorage.removeItem(passwordResetTokenKey);
}

export function savePendingEmailVerification(pending: PendingEmailVerification) {
  sessionStorage.setItem(pendingEmailVerificationKey, JSON.stringify(pending));
}

export function getPendingEmailVerification(): PendingEmailVerification | null {
  const value = sessionStorage.getItem(pendingEmailVerificationKey);
  if (!value) return null;

  try {
    const pending = JSON.parse(value) as Partial<PendingEmailVerification>;
    if (pending.requiresEmailVerification === true && typeof pending.challengeId === 'string' && typeof pending.email === 'string') {
      return pending as PendingEmailVerification;
    }
  } catch {
    sessionStorage.removeItem(pendingEmailVerificationKey);
  }

  return null;
}

export function clearPendingEmailVerification() {
  sessionStorage.removeItem(pendingEmailVerificationKey);
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
