'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, prefixIcon, suffixIcon, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-cme-text"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {prefixIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-cme-text-muted">
              {prefixIcon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-cme-surface px-3 py-2 text-sm text-cme-text placeholder:text-cme-text-muted',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error
                ? 'border-cme-error focus:ring-cme-error/50 focus:border-cme-error'
                : 'border-cme-border hover:border-cme-border-bright',
              prefixIcon && 'pl-10',
              suffixIcon && 'pr-10',
              className
            )}
            ref={ref}
            {...props}
          />
          {suffixIcon && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-cme-text-muted">
              {suffixIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-cme-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
