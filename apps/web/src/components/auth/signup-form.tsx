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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SignupForm() {
  const router = useRouter();
  const { signup, signupWithGoogle } = useAuthStore();
  const { error: showError } = useToast();

  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
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

  const handleGoogleSignup = async () => {
    setFormError('');
    setIsGoogleLoading(true);

    try {
      await signupWithGoogle();
      router.push(ROUTES.DASHBOARD);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-up failed';
      setFormError(message);
      showError('Signup failed', message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isDisabled = isSubmitting || isGoogleLoading;

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

      <div className="space-y-5">
        {formError && (
          <div className="rounded-lg border border-cme-error/30 bg-cme-error/10 px-4 py-3 text-sm text-cme-error">
            {formError}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          size="lg"
          onClick={handleGoogleSignup}
          disabled={isDisabled}
          isLoading={isGoogleLoading}
        >
          {!isGoogleLoading && <GoogleIcon className="mr-2 h-5 w-5" />}
          Sign up with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-cme-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-cme-bg px-2 text-cme-text-muted">
              or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Full Name"
            type="text"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            prefixIcon={<User className="h-4 w-4" />}
            autoComplete="name"
            disabled={isDisabled}
          />

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            prefixIcon={<Mail className="h-4 w-4" />}
            autoComplete="email"
            disabled={isDisabled}
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
              disabled={isDisabled}
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
            disabled={isDisabled}
          />

          <Button
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isSubmitting}
            disabled={isDisabled}
          >
            Create Account
          </Button>
        </form>
      </div>

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
