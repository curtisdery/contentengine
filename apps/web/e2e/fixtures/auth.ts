import { Page } from '@playwright/test';
import { mockAllApiRoutes, mockApiUnauthenticated } from './mock-api';
import { MOCK_USER } from '../helpers/mock-responses';

/**
 * Block all Firebase API calls so tests run fully offline.
 */
async function blockFirebaseApis(page: Page) {
  await page.route('**/*identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/*securetoken.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebaseinstallations.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebase.googleapis.com/**', (route) => route.abort());
  await page.route('**/*google-analytics.com/**', (route) => route.abort());
  await page.route('**/*googletagmanager.com/**', (route) => route.abort());
}

/**
 * Set up an authenticated session for E2E tests.
 * Injects a mock user into the auth store via window flags.
 */
export async function setupAuthenticated(page: Page) {
  await blockFirebaseApis(page);
  await mockAllApiRoutes(page);

  // Inject the E2E auth bypass flag before any JS executes
  await page.addInitScript((user) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = user;
  }, MOCK_USER);
}

/**
 * Set up an unauthenticated session for E2E tests.
 * The auth store will see no user and set isAuthenticated = false.
 */
export async function setupUnauthenticated(page: Page) {
  await blockFirebaseApis(page);
  await mockApiUnauthenticated(page);

  // Inject flag that tells auth store to skip Firebase and remain unauthenticated
  await page.addInitScript(() => {
    (window as any).__E2E_SKIP_AUTH__ = true;
  });
}
