'use client';

import { cn } from '@/lib/utils';

const VOICE_ATTRIBUTES = [
  'bold',
  'warm',
  'nerdy',
  'irreverent',
  'authoritative',
  'vulnerable',
  'witty',
  'direct',
  'empathetic',
  'provocative',
  'analytical',
  'casual',
  'professional',
  'inspiring',
  'educational',
] as const;

interface AttributePickerProps {
  selected: string[];
  onChange: (attrs: string[]) => void;
  max?: number;
}

function AttributePicker({ selected, onChange, max = 5 }: AttributePickerProps) {
  const handleToggle = (attr: string) => {
    if (selected.includes(attr)) {
      onChange(selected.filter((a) => a !== attr));
    } else if (selected.length < max) {
      onChange([...selected, attr]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cme-text-muted">
          Select your voice attributes
        </p>
        <span
          className={cn(
            'text-xs font-medium',
            selected.length >= max ? 'text-cme-warning' : 'text-cme-text-muted'
          )}
        >
          {selected.length} of {max} selected
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {VOICE_ATTRIBUTES.map((attr) => {
          const isSelected = selected.includes(attr);
          const isDisabled = !isSelected && selected.length >= max;

          return (
            <button
              key={attr}
              type="button"
              onClick={() => handleToggle(attr)}
              disabled={isDisabled}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cme-bg',
                isSelected
                  ? 'border-cme-primary bg-cme-primary/20 text-cme-primary shadow-[0_0_12px_rgba(108,92,231,0.3)]'
                  : 'border-cme-border bg-cme-surface text-cme-text-muted hover:border-cme-border-bright hover:text-cme-text hover:bg-cme-surface-hover',
                isDisabled && 'cursor-not-allowed opacity-40'
              )}
            >
              {attr}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { AttributePicker, VOICE_ATTRIBUTES };
