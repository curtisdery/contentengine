'use client';

import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, Menu } from 'lucide-react';
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
import { NotificationsDropdown } from '@/components/layout/notifications-dropdown';
import { useAuthStore } from '@/stores/auth-store';
import { ROUTES } from '@/lib/constants';

interface TopbarProps {
  sidebarCollapsed: boolean;
  onMenuToggle: () => void;
}

function Topbar({ sidebarCollapsed, onMenuToggle }: TopbarProps) {
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
        'left-0 md:left-[72px]',
        !sidebarCollapsed && 'md:left-[260px]'
      )}
    >
      {/* Mobile hamburger */}
      <button className="mr-auto md:hidden p-2 rounded-lg hover:bg-cme-surface-hover" onClick={onMenuToggle}>
        <Menu className="h-5 w-5 text-cme-text" />
      </button>

      {/* Notification Bell */}
      <NotificationsDropdown />

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
