'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Bot,
  CreditCard,
  Globe,
  Pencil,
  Shield,
  User,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { callFunction } from '@/lib/cloud-functions';
import { SUBSCRIPTION_LABELS, ROUTES } from '@/lib/constants';
import { PageTitle } from '@/components/layout/page-title';

// ---------------------------------------------------------------------------
// Navigation Card
// ---------------------------------------------------------------------------

interface SettingsNavCardProps {
  href: string;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'success' | 'warning';
}

function SettingsNavCard({
  href,
  icon,
  iconColor,
  title,
  description,
  badge,
  badgeVariant = 'default',
}: SettingsNavCardProps) {
  const router = useRouter();

  return (
    <Card
      className="group cursor-pointer hover:border-cme-border-bright transition-all duration-300"
      onClick={() => router.push(href)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className="shrink-0 rounded-lg p-2.5 transition-all duration-300 group-hover:scale-110"
          style={{
            backgroundColor: `${iconColor}15`,
            color: iconColor,
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-cme-text group-hover:text-white transition-colors">
              {title}
            </p>
            {badge && (
              <Badge variant={badgeVariant} className="text-[10px]">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-cme-text-muted">{description}</p>
        </div>
        <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-cme-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const { user, initialize } = useAuthStore();
  const { success: showSuccess, error: showError } = useToast();
  const [billingLoading, setBillingLoading] = React.useState<'portal' | 'checkout' | null>(null);

  // FIX 5: Password reset
  const [showPasswordConfirm, setShowPasswordConfirm] = React.useState(false);
  const [isResettingPassword, setIsResettingPassword] = React.useState(false);

  // FIX 6: 2FA info modal
  const [show2FAInfo, setShow2FAInfo] = React.useState(false);

  // FIX 9: Profile editing
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      showSuccess('Reset link sent', `Check ${user.email} for a password reset link.`);
      setShowPasswordConfirm(false);
    } catch {
      showError('Failed to send reset link', 'Please try again later.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!auth.currentUser || !editName.trim()) return;
    setIsSavingProfile(true);
    try {
      await updateProfile(auth.currentUser, { displayName: editName.trim() });
      initialize();
      showSuccess('Profile updated', 'Your display name has been changed.');
      setIsEditingProfile(false);
    } catch {
      showError('Update failed', 'Could not update your profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const subscriptionTier = user?.subscription_tier || 'free';
  const subscriptionLabel =
    SUBSCRIPTION_LABELS[subscriptionTier] || 'Free';

  const handleManageSubscription = async () => {
    setBillingLoading('portal');
    try {
      const res = await callFunction<Record<string, unknown>, { portal_url: string }>('createPortal', {});
      window.location.href = res.portal_url;
    } catch {
      showError('Billing Error', 'Unable to open subscription management. Please try again.');
      setBillingLoading(null);
    }
  };

  const handleUpgrade = async (tier: 'growth' | 'pro') => {
    setBillingLoading('checkout');
    try {
      const body = {
        tier,
        success_url: `${window.location.origin}/settings?upgraded=true`,
        cancel_url: `${window.location.origin}/settings`,
      };
      const res = await callFunction<typeof body, { checkout_url: string }>('createCheckout', body);
      window.location.href = res.checkout_url;
    } catch {
      showError('Billing Error', 'Unable to start checkout. Please try again.');
      setBillingLoading(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <PageTitle title="Settings" />
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-cme-text">Settings</h1>
        <p className="text-cme-text-muted">
          Manage your account and preferences
        </p>
      </div>

      {/* Quick Navigation */}
      <div>
        <h2 className="text-sm font-medium text-cme-text-muted uppercase tracking-wider mb-3">
          Manage
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SettingsNavCard
            href={ROUTES.SETTINGS_CONNECTIONS}
            icon={<Globe className="h-5 w-5" />}
            iconColor="#00cec9"
            title="Connected Platforms"
            description="Manage platform integrations"
          />
          <SettingsNavCard
            href={ROUTES.SETTINGS_AUTOPILOT}
            icon={<Bot className="h-5 w-5" />}
            iconColor="#00b894"
            title="Autopilot"
            description="Automated publishing settings"
            badge="New"
            badgeVariant="success"
          />
          <SettingsNavCard
            href={ROUTES.SETTINGS_SECURITY}
            icon={<Shield className="h-5 w-5" />}
            iconColor="#fdcb6e"
            title="Security"
            description="Sessions and security events"
          />
        </div>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cme-primary/10 p-2 text-cme-primary">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your personal information</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditName(user?.full_name || '');
                setIsEditingProfile(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar
              name={user?.full_name}
              src={user?.avatar_url}
              size="lg"
              status="online"
            />
            <div>
              <p className="text-lg font-semibold text-cme-text">
                {user?.full_name || 'User'}
              </p>
              <p className="text-sm text-cme-text-muted">
                {user?.email || 'user@example.com'}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Full Name
              </label>
              <p className="mt-1 text-sm text-cme-text">
                {user?.full_name || '---'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Email Address
              </label>
              <p className="mt-1 text-sm text-cme-text">
                {user?.email || '---'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Member Since
              </label>
              <p className="mt-1 font-mono text-sm text-cme-text">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '---'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Account Status
              </label>
              <div className="mt-1">
                <Badge variant="success" dot>
                  Active
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cme-secondary/10 p-2 text-cme-secondary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>
                Manage your plan and billing
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-cme-border bg-cme-surface-hover/50 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-cme-text">
                  {subscriptionLabel} Plan
                </p>
                <Badge
                  variant={
                    subscriptionTier === 'pro'
                      ? 'default'
                      : subscriptionTier === 'growth'
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {subscriptionLabel}
                </Badge>
              </div>
              <p className="text-sm text-cme-text-muted">
                {subscriptionTier === 'free'
                  ? 'Upgrade to unlock more content multiplications and platform integrations.'
                  : subscriptionTier === 'pro'
                  ? 'Unlimited uploads, autopilot scheduling, A/B testing, and full analytics.'
                  : subscriptionTier === 'growth'
                  ? 'All 18 platforms, brand voice profiles, content calendar, and priority generation.'
                  : 'You have access to content features and platform integrations.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              isLoading={billingLoading === 'portal'}
              disabled={billingLoading !== null}
            >
              Manage Subscription
            </Button>
            {subscriptionTier === 'free' && (
              <Button
                onClick={() => handleUpgrade('growth')}
                isLoading={billingLoading === 'checkout'}
                disabled={billingLoading !== null}
              >
                Upgrade to Growth
              </Button>
            )}
            {(subscriptionTier === 'free' || subscriptionTier === 'starter' || subscriptionTier === 'growth') && subscriptionTier !== 'free' && (
              <Button
                variant="outline"
                onClick={() => handleUpgrade('pro')}
                isLoading={billingLoading === 'checkout'}
                disabled={billingLoading !== null}
              >
                Upgrade to Pro
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cme-warning/10 p-2 text-cme-warning">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                Password and authentication settings
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-cme-border bg-cme-surface-hover/50 p-4">
            <div>
              <p className="text-sm font-medium text-cme-text">Password</p>
              <p className="text-xs text-cme-text-muted">
                Last changed: Never
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordConfirm(true)}>
              Change Password
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-cme-border bg-cme-surface-hover/50 p-4">
            <div>
              <p className="text-sm font-medium text-cme-text">
                Two-Factor Authentication
              </p>
              <p className="text-xs text-cme-text-muted">
                Add an extra layer of security
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShow2FAInfo(true)}>
              Enable
            </Button>
          </div>

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-cme-text-muted"
              onClick={() => router.push(ROUTES.SETTINGS_SECURITY)}
            >
              View all security settings
              <ArrowUpRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Reset Confirmation Modal */}
      {showPasswordConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowPasswordConfirm(false)}
          />
          <Card className="relative z-10 mx-4 w-full max-w-sm border-cme-border shadow-2xl">
            <button
              onClick={() => setShowPasswordConfirm(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <CardContent className="flex flex-col items-center py-8 px-6 text-center">
              <div className="mb-4 rounded-2xl bg-cme-warning/10 p-4">
                <Shield className="h-8 w-8 text-cme-warning" />
              </div>
              <h3 className="text-lg font-semibold text-cme-text">
                Reset Password
              </h3>
              <p className="mt-2 text-sm text-cme-text-muted">
                We&apos;ll send a reset link to{' '}
                <span className="font-medium text-cme-text">
                  {user?.email}
                </span>
              </p>
              <div className="mt-6 flex w-full gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPasswordConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handlePasswordReset}
                  isLoading={isResettingPassword}
                  disabled={isResettingPassword}
                >
                  Send Reset Link
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2FA Info Modal */}
      {show2FAInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShow2FAInfo(false)}
          />
          <Card className="relative z-10 mx-4 w-full max-w-sm border-cme-border shadow-2xl">
            <button
              onClick={() => setShow2FAInfo(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <CardContent className="flex flex-col items-center py-8 px-6 text-center">
              <div className="mb-4 rounded-2xl bg-cme-primary/10 p-4">
                <Shield className="h-8 w-8 text-cme-primary" />
              </div>
              <h3 className="text-lg font-semibold text-cme-text">
                Two-Factor Authentication
              </h3>
              <p className="mt-2 text-sm text-cme-text-muted leading-relaxed">
                We are building TOTP-based two-factor authentication and it will
                be available in an upcoming release. Your account is currently
                protected by Firebase Authentication with secure session
                management.
              </p>
              <Button
                className="mt-6 w-full"
                onClick={() => setShow2FAInfo(false)}
              >
                Got It
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Profile Edit Modal */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsEditingProfile(false)}
          />
          <Card className="relative z-10 mx-4 w-full max-w-sm border-cme-border shadow-2xl">
            <button
              onClick={() => setIsEditingProfile(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <CardContent className="py-8 px-6">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="mb-4 rounded-2xl bg-cme-primary/10 p-4">
                  <User className="h-8 w-8 text-cme-primary" />
                </div>
                <h3 className="text-lg font-semibold text-cme-text">
                  Edit Profile
                </h3>
              </div>
              <Input
                label="Display Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
              />
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditingProfile(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSaveProfile}
                  isLoading={isSavingProfile}
                  disabled={isSavingProfile || !editName.trim()}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
