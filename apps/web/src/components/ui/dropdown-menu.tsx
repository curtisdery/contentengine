'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownMenuContextValue {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  close: () => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  isOpen: false,
  setIsOpen: () => {},
  close: () => {},
});

function DropdownMenu({ children }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => setIsOpen(false), []);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <DropdownMenuContext.Provider value={{ isOpen, setIsOpen, close }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  className?: string;
}

function DropdownMenuTrigger({ children, className }: DropdownMenuTriggerProps) {
  const { isOpen, setIsOpen } = React.useContext(DropdownMenuContext);

  return (
    <button
      type="button"
      className={cn('focus:outline-none', className)}
      onClick={() => setIsOpen(!isOpen)}
      aria-expanded={isOpen}
      aria-haspopup="menu"
    >
      {children}
    </button>
  );
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'center';
}

function DropdownMenuContent({
  children,
  className,
  align = 'end',
}: DropdownMenuContentProps) {
  const { isOpen } = React.useContext(DropdownMenuContext);

  if (!isOpen) return null;

  return (
    <div
      role="menu"
      className={cn(
        'absolute z-50 mt-2 min-w-[180px] overflow-hidden rounded-lg',
        'border border-cme-border bg-cme-surface/95 backdrop-blur-xl',
        'shadow-lg shadow-black/20',
        'animate-fade-in',
        align === 'end' && 'right-0',
        align === 'start' && 'left-0',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        className
      )}
    >
      <div className="p-1">{children}</div>
    </div>
  );
}

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  destructive?: boolean;
}

function DropdownMenuItem({
  children,
  className,
  destructive,
  onClick,
  ...props
}: DropdownMenuItemProps) {
  const { close } = React.useContext(DropdownMenuContext);

  return (
    <button
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150',
        'focus:outline-none focus:bg-cme-surface-hover',
        destructive
          ? 'text-cme-error hover:bg-cme-error/10'
          : 'text-cme-text hover:bg-cme-surface-hover',
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        close();
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn('my-1 h-px bg-cme-border', className)}
    />
  );
}

interface DropdownMenuLabelProps {
  children: React.ReactNode;
  className?: string;
}

function DropdownMenuLabel({ children, className }: DropdownMenuLabelProps) {
  return (
    <div
      className={cn(
        'px-3 py-2 text-xs font-medium text-cme-text-muted',
        className
      )}
    >
      {children}
    </div>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
