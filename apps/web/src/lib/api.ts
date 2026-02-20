import { API_BASE_URL, STORAGE_KEYS } from './constants';

class ApiClientError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  private setTokens(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh);
  }

  private clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let detail = 'An unexpected error occurred';
      try {
        const errorBody = await response.json();
        detail = errorBody.detail || errorBody.message || detail;
      } catch {
        detail = response.statusText || detail;
      }
      throw new ApiClientError(response.status, detail);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    skipAuth = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getAccessToken();
    if (token && !skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      config.body = JSON.stringify(body);
    }

    let response = await fetch(`${this.baseUrl}${path}`, config);

    if (response.status === 401 && !skipAuth) {
      const refreshed = await this.attemptTokenRefresh();
      if (refreshed) {
        const newToken = this.getAccessToken();
        headers['Authorization'] = `Bearer ${newToken}`;
        config.headers = headers;
        response = await fetch(`${this.baseUrl}${path}`, config);
      } else {
        this.clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiClientError(401, 'Session expired. Please log in again.');
      }
    }

    return this.handleResponse<T>(response);
  }

  private async attemptTokenRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      this.setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(path: string, skipAuth = false): Promise<T> {
    return this.request<T>('GET', path, undefined, skipAuth);
  }

  async post<T>(path: string, body?: unknown, skipAuth = false): Promise<T> {
    return this.request<T>('POST', path, body, skipAuth);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export { ApiClientError };
