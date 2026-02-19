'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  CalendarDays,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { Avatar } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/auth-store';
import { ROUTES } from '@/lib/constants';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  active: boolean;
  comingSoon?: boolean;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: ROUTES.DASHBOARD,
      icon: <LayoutDashboard className="h-5 w-5" />,
      active: pathname === ROUTES.DASHBOARD || pathname === '/',
    },
    {
      label: 'Content',
      href: ROUTES.CONTENT,
      icon: <FileText className="h-5 w-5" />,
      active: pathname.startsWith(ROUTES.CONTENT),
    },
    {
      label: 'Voice',
      href: ROUTES.VOICE_PROFILES,
      icon: <Mic className="h-5 w-5" />,
      active: pathname.startsWith('/voice'),
    },
    {
      label: 'Calendar',
      href: ROUTES.CALENDAR,
      icon: <CalendarDays className="h-5 w-5" />,
      active: pathname.startsWith(ROUTES.CALENDAR),
    },
    {
      label: 'Analytics',
      href: ROUTES.ANALYTICS,
      icon: <BarChart3 className="h-5 w-5" />,
      active: pathname.startsWith(ROUTES.ANALYTICS),
    },
    {
      label: 'Settings',
      href: ROUTES.SETTINGS,
      icon: <Settings className="h-5 w-5" />,
      active: pathname.startsWith(ROUTES.SETTINGS),
    },
  ];

  const handleLogout = async () => {
    await logout();
    router.push(ROUTES.LOGIN);
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-cme-border bg-cme-surface/50 backdrop-blur-xl',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-cme-border',
          collapsed ? 'justify-center px-2' : 'px-5'
        )}
      >
        <Logo collapsed={collapsed} size="md" />
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.href}>
              {item.comingSoon ? (
                <div
                  className={cn(
                    'group relative flex items-center rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                    'text-cme-text-muted cursor-not-allowed opacity-60',
                    collapsed ? 'justify-center' : 'gap-3'
                  )}
                  title={collapsed ? `${item.label} (Coming Soon)` : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <span className="flex-1">{item.label}</span>
                  )}
                  {!collapsed && (
                    <span className="text-[10px] rounded-full bg-cme-surface-hover px-2 py-0.5 text-cme-text-muted">
                      Soon
                    </span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 hidden group-hover:block">
                      <div className="rounded-md bg-cme-surface border border-cme-border px-3 py-1.5 text-xs text-cme-text-muted whitespace-nowrap shadow-lg">
                        {item.label} — Coming Soon
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'group relative flex items-center rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                    item.active
                      ? 'bg-cme-primary/10 text-cme-primary shadow-[inset_0_0_20px_rgba(108,92,231,0.1)]'
                      : 'text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover',
                    collapsed ? 'justify-center' : 'gap-3'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {item.active && (
                    <div className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-cme-primary" />
                  )}
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {collapsed && (
                    <div className="absolute left-full ml-2 hidden group-hover:block">
                      <div className="rounded-md bg-cme-surface border border-cme-border px-3 py-1.5 text-xs text-cme-text whitespace-nowrap shadow-lg">
                        {item.label}
                      </div>
                    </div>
                  )}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="px-3 py-2">
        <button
          onClick={onToggle}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2 text-sm text-cme-text-muted',
            'hover:bg-cme-surface-hover hover:text-cme-text transition-colors duration-200',
            collapsed ? 'justify-center' : 'gap-3'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      <Separator />

      {/* User Section */}
      <div
        className={cn(
          'flex items-center border-t border-cme-border p-3',
          collapsed ? 'flex-col gap-2' : 'gap-3'
        )}
      >
        <Avatar
          name={user?.full_name}
          src={user?.avatar_url}
          size="sm"
          status="online"
        />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-cme-text">
              {user?.full_name || 'User'}
            </p>
            <p className="truncate text-xs text-cme-text-muted">
              {user?.email || ''}
            </p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'shrink-0 rounded-md p-1.5 text-cme-text-muted',
            'hover:bg-cme-surface-hover hover:text-cme-error transition-colors duration-200'
          )}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

export { Sidebar };
