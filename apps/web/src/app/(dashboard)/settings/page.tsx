'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  Bot,
  CreditCard,
  Globe,
  Shield,
  User,
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
import { useAuthStore } from '@/stores/auth-store';
import { SUBSCRIPTION_LABELS, ROUTES } from '@/lib/constants';

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
  return (
    <Link href={href}>
      <Card className="group cursor-pointer hover:border-cme-border-bright transition-all duration-300">
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
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { user } = useAuthStore();

  const subscriptionTier = user?.subscription_tier || 'free';
  const subscriptionLabel =
    SUBSCRIPTION_LABELS[subscriptionTier] || 'Free';

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
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
          Settings
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
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your personal information</CardDescription>
            </div>
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
                    subscriptionTier === 'enterprise'
                      ? 'secondary'
                      : subscriptionTier === 'pro'
                      ? 'default'
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
                  ? 'You have access to advanced content features and priority support.'
                  : 'Full access to all features including custom integrations and dedicated support.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline">Manage Subscription</Button>
            {subscriptionTier === 'free' && (
              <Button>Upgrade to Pro</Button>
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
                Last changed: Unknown
              </p>
            </div>
            <Button variant="outline" size="sm">
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
            <Button variant="outline" size="sm">
              Enable
            </Button>
          </div>

          <div className="pt-2">
            <Link href={ROUTES.SETTINGS_SECURITY}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-cme-text-muted">
                View all security settings
                <ArrowUpRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
