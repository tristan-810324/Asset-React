import { apiRequest } from '../auth/authApi'

export type GsoAccount = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
};

export async function listGsoAccounts() {
  const result = await apiRequest<{ users: GsoAccount[] }>('/users');
  return result.users;
}

export async function createGsoAccount(name: string, email: string) {
  const result = await apiRequest<{ user: GsoAccount }>('/users', {
    method: 'POST',
    body: JSON.stringify({ name, email }),
  });
  return result.user;
}
