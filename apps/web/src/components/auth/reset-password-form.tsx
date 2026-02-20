'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient, ApiClientError } from '@/lib/api';
import { getPasswordStrength } from '@/lib/auth';
import { ROUTES } from '@/lib/constants';
import { Logo } from '@/components/layout/logo';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  const passwordStrength = React.useMemo(
    () => getPasswordStrength(password),
    [password]
  );

  if (!token) {
    return (
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex justify-center lg:hidden">
          <Logo size="lg" />
        </div>

        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-bold text-cme-text">Invalid link</h1>
          <p className="text-cme-text-muted">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
        </div>

        <Link href="/forgot-password" className="block">
          <Button className="w-full" size="lg">
            Request new reset link
          </Button>
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex justify-center lg:hidden">
          <Logo size="lg" />
        </div>

        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cme-success/10">
            <CheckCircle className="h-8 w-8 text-cme-success" />
          </div>
          <h1 className="text-3xl font-bold text-cme-text">Password reset</h1>
          <p className="text-cme-text-muted">
            Your password has been successfully reset. You can now log in with your new password.
          </p>
        </div>

        <Link href={ROUTES.LOGIN} className="block">
          <Button className="w-full" size="lg">
            Go to login
          </Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < 12) {
      setFormError('Password must be at least 12 characters');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      await apiClient.post(
        '/api/v1/auth/reset-password',
        { token, password },
        true
      );
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.detail);
      } else {
        setFormError('Failed to reset password. The link may have expired.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 px-4">
      <div className="flex justify-center lg:hidden">
        <Logo size="lg" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-cme-text">Set new password</h1>
        <p className="text-cme-text-muted">
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && (
          <div className="rounded-lg border border-cme-error/30 bg-cme-error/10 px-4 py-3 text-sm text-cme-error">
            {formError}
          </div>
        )}

        <div className="space-y-2">
          <Input
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            prefixIcon={<Lock className="h-4 w-4" />}
            suffixIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="hover:text-cme-text transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
            autoComplete="new-password"
            disabled={isSubmitting}
          />

          {password.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full bg-cme-surface-hover overflow-hidden"
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: i < passwordStrength.score ? '100%' : '0%',
                        backgroundColor: passwordStrength.color,
                      }}
                    />
                  </div>
                ))}
              </div>
              <p
                className="text-xs font-medium"
                style={{ color: passwordStrength.color }}
              >
                {passwordStrength.label}
              </p>
            </div>
          )}
        </div>

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          prefixIcon={<Lock className="h-4 w-4" />}
          error={
            confirmPassword && password !== confirmPassword
              ? 'Passwords do not match'
              : undefined
          }
          autoComplete="new-password"
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isSubmitting}
        >
          Reset Password
        </Button>
      </form>

      <Link
        href={ROUTES.LOGIN}
        className="flex items-center justify-center gap-2 text-sm text-cme-text-muted hover:text-cme-text transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to login
      </Link>
    </div>
  );
}
