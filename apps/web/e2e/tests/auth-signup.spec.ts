import { test, expect } from '@playwright/test';
import { setupUnauthenticated } from '../fixtures/auth';

test.describe('Signup Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  test('renders the signup form heading', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByText('Start multiplying your content today')).toBeVisible();
  });

  test('has Google sign-up button', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('button', { name: /Sign up with Google/i })).toBeVisible();
  });

  test('has all form fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Create a strong password')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm your password')).toBeVisible();
  });

  test('has a Create Account submit button', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('shows validation error when full name is empty', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Full name is required')).toBeVisible();
  });

  test('shows validation error for short password', async ({ page }) => {
    await page.goto('/signup');
    await page.getByPlaceholder('John Doe').fill('Test User');
    await page.getByPlaceholder('you@example.com').fill('test@test.com');
    await page.getByPlaceholder('Create a strong password').fill('short');
    await page.getByPlaceholder('Confirm your password').fill('short');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Password must be at least 12 characters')).toBeVisible();
  });

  test('shows password strength indicator when typing', async ({ page }) => {
    await page.goto('/signup');
    await page.getByPlaceholder('Create a strong password').fill('Test');
    await expect(page.locator('.strength-bar').first()).toBeVisible();
  });

  test('shows mismatch error for different passwords', async ({ page }) => {
    await page.goto('/signup');
    await page.getByPlaceholder('Create a strong password').fill('LongEnoughPassword1!');
    await page.getByPlaceholder('Confirm your password').fill('DifferentPassword1!');
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('has link to login page', async ({ page }) => {
    await page.goto('/signup');
    const loginLink = page.getByRole('link', { name: 'Log in' });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');
  });
});
