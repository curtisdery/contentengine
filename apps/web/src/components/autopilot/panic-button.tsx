'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ShieldOff,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PanicButtonProps {
  onConfirm: () => Promise<void>;
  label?: string;
  description?: string;
}

function PanicButton({
  onConfirm,
  label = 'Emergency Stop',
  description = 'Instantly disconnects all platforms, revokes all sessions, and disables all autopilot. This action cannot be undone.',
}: PanicButtonProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [isExecuting, setIsExecuting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const isConfirmed = confirmText === 'CONFIRM';

  const handleOpen = () => {
    setIsModalOpen(true);
    setConfirmText('');
    // Focus input after modal animation
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const handleClose = () => {
    if (isExecuting) return;
    setIsModalOpen(false);
    setConfirmText('');
  };

  const handleConfirm = async () => {
    if (!isConfirmed || isExecuting) return;
    setIsExecuting(true);
    try {
      await onConfirm();
    } finally {
      setIsExecuting(false);
      setIsModalOpen(false);
      setConfirmText('');
    }
  };

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="destructive"
        onClick={handleOpen}
        className="gap-2"
      >
        <ShieldOff className="h-4 w-4" />
        {label}
      </Button>

      {/* Modal overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleClose}
          />

          {/* Modal */}
          <div
            className={cn(
              'relative z-10 w-full max-w-md mx-4',
              'rounded-xl border-2 border-cme-error/50 bg-cme-surface',
              'shadow-[0_0_40px_rgba(225,112,85,0.15)]',
              'animate-fade-in'
            )}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              disabled={isExecuting}
              className="absolute top-4 right-4 text-cme-text-muted hover:text-cme-text transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6">
              {/* Warning icon */}
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-cme-error/10 p-4 border border-cme-error/20">
                  <AlertTriangle className="h-8 w-8 text-cme-error" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-cme-text text-center mb-2">
                Are you absolutely sure?
              </h2>

              {/* Description */}
              <p className="text-sm text-cme-text-muted text-center mb-6 leading-relaxed">
                {description}
              </p>

              {/* Warning box */}
              <div className="rounded-lg border border-cme-error/30 bg-cme-error/5 p-3 mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-cme-error shrink-0 mt-0.5" />
                  <div className="text-xs text-cme-error/90 leading-relaxed">
                    <p className="font-semibold mb-1">This will immediately:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-cme-error/70">
                      <li>Disable all autopilot configurations</li>
                      <li>Revoke all platform connections</li>
                      <li>Cancel all scheduled publications</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Confirmation input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-cme-text mb-2">
                  Type{' '}
                  <span className="font-mono text-cme-error font-bold">
                    CONFIRM
                  </span>{' '}
                  to proceed
                </label>
                <Input
                  ref={inputRef}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type CONFIRM here"
                  disabled={isExecuting}
                  className={cn(
                    'font-mono text-center',
                    isConfirmed && 'border-cme-error focus:border-cme-error focus:ring-cme-error/50'
                  )}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isExecuting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirm}
                  disabled={!isConfirmed || isExecuting}
                  className={cn(
                    'flex-1 gap-2',
                    isConfirmed &&
                      'shadow-[0_0_25px_rgba(225,112,85,0.3)] hover:shadow-[0_0_35px_rgba(225,112,85,0.45)]'
                  )}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-4 w-4" />
                      Confirm Emergency Stop
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export { PanicButton };
