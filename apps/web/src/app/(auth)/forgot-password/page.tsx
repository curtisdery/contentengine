'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { ROUTES } from '@/lib/constants';
import { Logo } from '@/components/layout/logo';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuthStore();
  const [email, setEmail] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!email.trim()) {
      setFormError('Email is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(email);
      setSubmitted(true);
    } catch {
      // Always show success to prevent email enumeration
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex justify-center lg:hidden">
          <Logo size="lg" />
        </div>

        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cme-success/10">
            <CheckCircle className="h-8 w-8 text-cme-success" />
          </div>
          <h1 className="text-3xl font-bold text-cme-text">Check your email</h1>
          <p className="text-cme-text-muted leading-relaxed">
            If an account exists for <span className="font-medium text-cme-text">{email}</span>,
            we&apos;ve sent a password reset link. Check your inbox and spam folder.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              setSubmitted(false);
              setEmail('');
            }}
          >
            Try a different email
          </Button>
          <Link href={ROUTES.LOGIN} className="block">
            <Button variant="ghost" className="w-full" size="lg">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-8 px-4">
      <div className="flex justify-center lg:hidden">
        <Logo size="lg" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-cme-text">Reset your password</h1>
        <p className="text-cme-text-muted">
          Enter your email and we&apos;ll send you a reset link.
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

        <Button
          type="submit"
          className="w-full"
          size="lg"
          isLoading={isSubmitting}
        >
          Send Reset Link
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
