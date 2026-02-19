'use client';

import { useRouter } from 'next/navigation';
import { Bell, User, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth-store';
import { ROUTES } from '@/lib/constants';

interface TopbarProps {
  sidebarCollapsed: boolean;
}

function Topbar({ sidebarCollapsed }: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push(ROUTES.LOGIN);
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 flex h-16 items-center justify-end border-b border-cme-border bg-cme-bg/80 backdrop-blur-xl px-6 gap-3',
        'transition-all duration-300',
        sidebarCollapsed ? 'left-[72px]' : 'left-[260px]'
      )}
    >
      {/* Notification Bell */}
      <button
        className={cn(
          'relative rounded-lg p-2 text-cme-text-muted',
          'hover:bg-cme-surface-hover hover:text-cme-text transition-colors duration-200',
          'focus-ring'
        )}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {/* Notification dot */}
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-cme-primary" />
      </button>

      {/* User Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cme-surface-hover transition-colors duration-200">
          <Avatar
            name={user?.full_name}
            src={user?.avatar_url}
            size="sm"
            status="online"
          />
          <span className="hidden sm:block text-sm font-medium text-cme-text">
            {user?.full_name || 'User'}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <div>
              <p className="text-sm font-medium text-cme-text">
                {user?.full_name || 'User'}
              </p>
              <p className="text-xs text-cme-text-muted">
                {user?.email || ''}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(ROUTES.SETTINGS)}>
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(ROUTES.SETTINGS)}>
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export { Topbar };
