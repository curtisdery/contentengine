import { getFunctions, httpsCallable, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getFirebaseApp } from './firebase';

let functionsInstance: Functions | null = null;

function getCloudFunctions(): Functions {
  if (functionsInstance) return functionsInstance;

  const app = getFirebaseApp();
  if (!app) {
    throw new ApiClientError(500, 'Firebase not initialized');
  }

  functionsInstance = getFunctions(app);

  if (process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR === 'true') {
    connectFunctionsEmulator(functionsInstance, 'localhost', 5001);
  }

  return functionsInstance;
}

export class ApiClientError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
  }
}

const ERROR_CODE_MAP: Record<string, number> = {
  'functions/not-found': 404,
  'functions/permission-denied': 403,
  'functions/unauthenticated': 401,
  'functions/invalid-argument': 400,
  'functions/already-exists': 409,
  'functions/resource-exhausted': 429,
  'functions/failed-precondition': 412,
  'functions/unavailable': 503,
  'functions/internal': 500,
  'functions/deadline-exceeded': 504,
  'functions/cancelled': 499,
  'functions/data-loss': 500,
  'functions/unknown': 500,
  'functions/unimplemented': 501,
  'functions/out-of-range': 400,
  'functions/aborted': 409,
};

export async function callFunction<TInput = Record<string, unknown>, TOutput = unknown>(
  functionName: string,
  data?: TInput,
): Promise<TOutput> {
  // E2E test bypass — return mock data without hitting Firebase
  if (typeof window !== 'undefined' && (window as any).__E2E_MOCK_FUNCTIONS__) {
    const mockFn = (window as any).__E2E_MOCK_FUNCTIONS__[functionName];
    if (mockFn) return mockFn(data) as TOutput;
    return {} as TOutput;
  }

  try {
    const functions = getCloudFunctions();
    const callable = httpsCallable<TInput, TOutput>(functions, functionName);
    const result = await callable(data ?? ({} as TInput));
    return result.data;
  } catch (err: unknown) {
    if (err instanceof ApiClientError) throw err;

    const firebaseErr = err as { code?: string; message?: string };
    const status = ERROR_CODE_MAP[firebaseErr.code ?? ''] ?? 500;
    const detail = firebaseErr.message ?? 'An unexpected error occurred';
    throw new ApiClientError(status, detail);
  }
}
