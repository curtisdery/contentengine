'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import { Logo } from '@/components/layout/logo';

function LoginForm() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { error: showError } = useToast();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!email.trim()) {
      setFormError('Email is required');
      return;
    }

    if (!password) {
      setFormError('Password is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email, password);
      router.push(ROUTES.DASHBOARD);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setFormError(message);
      showError('Login failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 px-4">
      {/* Mobile logo */}
      <div className="flex justify-center lg:hidden">
        <Logo size="lg" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-cme-text">Welcome back</h1>
        <p className="text-cme-text-muted">
          Sign in to your Pandocast account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && (
          <div className="rounded-lg border border-cme-error/30 bg-cme-error/10 px-4 py-3 text-sm text-cme-error">
            {formError}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          prefixIcon={<Mail className="h-4 w-4" />}
          autoComplete="email"
          disabled={isSubmitting}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
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
          autoComplete="current-password"
          disabled={isSubmitting}
        />

        <div className="flex items-center justify-end">
          <button
            type="button"
            className="text-xs text-cme-primary hover:text-cme-primary-hover transition-colors"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isSubmitting}
        >
          Sign In
        </Button>
      </form>

      <p className="text-center text-sm text-cme-text-muted">
        Don&apos;t have an account?{' '}
        <Link
          href={ROUTES.SIGNUP}
          className="font-medium text-cme-primary hover:text-cme-primary-hover transition-colors"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}

export { LoginForm };
