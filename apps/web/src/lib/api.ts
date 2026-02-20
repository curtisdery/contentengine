import { auth } from './firebase';
import { API_BASE_URL } from './constants';

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

  private async getAccessToken(): Promise<string | null> {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
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

    if (!skipAuth) {
      const token = await this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, config);
    return this.handleResponse<T>(response);
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
