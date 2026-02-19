import { STORAGE_KEYS } from './constants';

export function getStoredTokens(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null };
  }

  return {
    accessToken: localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
    refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
  };
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
}

export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000;
    return Date.now() >= exp;
  } catch {
    return true;
  }
}

export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'Weak', color: '#e17055' };
  if (score <= 2) return { score, label: 'Fair', color: '#fdcb6e' };
  if (score <= 3) return { score, label: 'Good', color: '#00cec9' };
  if (score <= 4) return { score, label: 'Strong', color: '#00b894' };
  return { score, label: 'Very Strong', color: '#00b894' };
}
