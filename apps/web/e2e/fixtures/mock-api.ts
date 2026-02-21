import { Page } from '@playwright/test';
import {
  MOCK_USER,
  MOCK_CONTENT_LIST,
  MOCK_AUTOPILOT_SUMMARY,
  MOCK_ANALYTICS_SUMMARY,
  MOCK_SIGNUP_RESPONSE,
  MOCK_LOGOUT_RESPONSE,
} from '../helpers/mock-responses';

/**
 * Mock all API routes with authenticated responses.
 */
export async function mockAllApiRoutes(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  );

  await page.route('**/api/v1/auth/signup', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SIGNUP_RESPONSE) })
  );

  await page.route('**/api/v1/auth/logout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_LOGOUT_RESPONSE) })
  );

  await page.route('**/api/v1/content**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CONTENT_LIST) })
  );

  await page.route('**/api/v1/autopilot/summary**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AUTOPILOT_SUMMARY) })
  );

  await page.route('**/api/v1/analytics**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYTICS_SUMMARY) })
  );

  // Catch-all for any unmocked API endpoints
  await page.route('**/api/v1/**', (route) => {
    // Only intercept if not already handled
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

/**
 * Mock all API routes as unauthenticated (401).
 */
export async function mockApiUnauthenticated(page: Page) {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  );
}
