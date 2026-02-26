import { Page } from '@playwright/test';
import { mockAllApiRoutes, mockApiUnauthenticated } from './mock-api';
import { MOCK_USER, MOCK_FREE_USER } from '../helpers/mock-responses';

/**
 * Block all Firebase API calls so tests run fully offline.
 */
export async function blockFirebaseApis(page: Page) {
  await page.route('**/*identitytoolkit.googleapis.com/**', (route) => route.abort());
  await page.route('**/*securetoken.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebaseinstallations.googleapis.com/**', (route) => route.abort());
  await page.route('**/*firebase.googleapis.com/**', (route) => route.abort());
  await page.route('**/*google-analytics.com/**', (route) => route.abort());
  await page.route('**/*googletagmanager.com/**', (route) => route.abort());
}

/**
 * Set up an authenticated session for E2E tests (growth tier).
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
 * Set up an authenticated session with a FREE-tier user.
 * Overrides subscription status and billing mocks for free tier testing.
 */
export async function setupAuthenticatedFree(page: Page) {
  await blockFirebaseApis(page);
  await mockAllApiRoutes(page);

  // Override subscription-related mocks for free tier
  await page.addInitScript((user) => {
    (window as any).__E2E_AUTH_MOCK__ = true;
    (window as any).__E2E_MOCK_USER__ = user;

    // Override the subscription and billing mocks
    const fns = (window as any).__E2E_MOCK_FUNCTIONS__;
    if (fns) {
      fns.getSubscriptionStatus = () => ({ tier: 'free', is_active: true });
      fns.createPortal = () => ({ portal_url: 'https://billing.stripe.com/test-portal' });
      fns.createCheckout = () => ({ checkout_url: 'https://checkout.stripe.com/test-session' });
    }
  }, MOCK_FREE_USER);
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
