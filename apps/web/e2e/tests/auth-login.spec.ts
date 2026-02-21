import { test, expect } from '@playwright/test';
import { setupUnauthenticated } from '../fixtures/auth';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthenticated(page);
  });

  test('renders the login form heading', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Sign in to your Pandocast account')).toBeVisible();
  });

  test('has Google sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
  });

  test('has email and password inputs', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  });

  test('has a Sign In submit button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('shows validation error when email is empty', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Email is required')).toBeVisible();
  });

  test('shows validation error when password is empty', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill('test@test.com');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('has a password visibility toggle', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('has link to forgot password', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });

  test('has link to sign up page', async ({ page }) => {
    await page.goto('/login');
    const signupLink = page.getByRole('link', { name: 'Sign up' });
    await expect(signupLink).toBeVisible();
    await expect(signupLink).toHaveAttribute('href', '/signup');
  });
});
