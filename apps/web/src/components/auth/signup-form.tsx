'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { getPasswordStrength } from '@/lib/auth';
import { ROUTES } from '@/lib/constants';
import { Logo } from '@/components/layout/logo';

function SignupForm() {
  const router = useRouter();
  const { signup } = useAuthStore();
  const { error: showError } = useToast();

  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  const passwordStrength = React.useMemo(
    () => getPasswordStrength(password),
    [password]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim()) {
      setFormError('Full name is required');
      return;
    }

    if (!email.trim()) {
      setFormError('Email is required');
      return;
    }

    if (!password) {
      setFormError('Password is required');
      return;
    }

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
      await signup(email, password, fullName);
      router.push(ROUTES.DASHBOARD);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      setFormError(message);
      showError('Signup failed', message);
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
        <h1 className="text-3xl font-bold text-cme-text">Create your account</h1>
        <p className="text-cme-text-muted">
          Start multiplying your content today
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && (
          <div className="rounded-lg border border-cme-error/30 bg-cme-error/10 px-4 py-3 text-sm text-cme-error">
            {formError}
          </div>
        )}

        <Input
          label="Full Name"
          type="text"
          placeholder="John Doe"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          prefixIcon={<User className="h-4 w-4" />}
          autoComplete="name"
          disabled={isSubmitting}
        />

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

        <div className="space-y-2">
          <Input
            label="Password"
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

          {/* Password strength indicator */}
          {password.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full bg-cme-surface-hover overflow-hidden"
                  >
                    <div
                      className="strength-bar h-full rounded-full transition-all duration-300"
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
          type={showConfirmPassword ? 'text' : 'password'}
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          prefixIcon={<Lock className="h-4 w-4" />}
          suffixIcon={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="hover:text-cme-text transition-colors"
              tabIndex={-1}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
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
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm text-cme-text-muted">
        Already have an account?{' '}
        <Link
          href={ROUTES.LOGIN}
          className="font-medium text-cme-primary hover:text-cme-primary-hover transition-colors"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}

export { SignupForm };
