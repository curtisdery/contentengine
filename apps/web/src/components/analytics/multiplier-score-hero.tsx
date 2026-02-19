'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn, formatNumber } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ArrowUpRight, Zap } from 'lucide-react';

interface TopContentItem {
  content_id: string;
  title: string;
  multiplier_value: number;
  total_reach: number;
}

interface MultiplierScoreHeroProps {
  value: number;
  totalReach: number;
  platformCount: number;
  topContent: TopContentItem[];
}

function useCountUp(target: number, duration: number = 1500, enabled: boolean = true): number {
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) {
      setCurrent(0);
      return;
    }

    const steps = 60;
    const stepDuration = duration / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased * 10) / 10);

      if (step >= steps) {
        setCurrent(target);
        clearInterval(interval);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [target, duration, enabled]);

  return current;
}

function MultiplierScoreHero({
  value,
  totalReach,
  platformCount,
  topContent,
}: MultiplierScoreHeroProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const animatedValue = useCountUp(value, 1500, isVisible);
  const animatedReach = useCountUp(totalReach, 2000, isVisible);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      {/* Hero Section */}
      <Card className="relative overflow-hidden border-cme-primary/20">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-cme-primary/10 via-cme-bg to-cme-secondary/10" />

        {/* Concentric rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          {[1, 2, 3, 4].map((ring) => (
            <div
              key={ring}
              className={cn(
                'absolute rounded-full border border-cme-primary/10',
                'animate-pulse'
              )}
              style={{
                width: `${ring * 120 + 80}px`,
                height: `${ring * 120 + 80}px`,
                animationDelay: `${ring * 0.5}s`,
                animationDuration: `${3 + ring * 0.5}s`,
                opacity: isVisible ? 0.15 - ring * 0.02 : 0,
                transition: `opacity 1s ease ${ring * 0.2}s`,
              }}
            />
          ))}
        </div>

        {/* Sparkle particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-cme-primary"
              style={{
                left: `${15 + Math.random() * 70}%`,
                top: `${10 + Math.random() * 80}%`,
                opacity: isVisible ? 0.4 + Math.random() * 0.4 : 0,
                animation: isVisible
                  ? `pulse ${2 + Math.random() * 3}s ease-in-out infinite`
                  : 'none',
                animationDelay: `${Math.random() * 2}s`,
                transition: `opacity 1s ease ${0.5 + Math.random()}s`,
              }}
            />
          ))}
        </div>

        <div className="relative flex flex-col items-center py-16 px-6 text-center">
          {/* Multiplier badge */}
          <div
            className={cn(
              'mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5',
              'bg-cme-primary/10 border border-cme-primary/20',
              'transition-all duration-700',
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
            )}
          >
            <Zap className="h-4 w-4 text-cme-primary" />
            <span className="text-sm font-medium text-cme-primary">Content Multiplier Score</span>
          </div>

          {/* Big number */}
          <div
            className={cn(
              'transition-all duration-1000',
              isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            )}
          >
            <span
              className="font-mono text-7xl font-black tracking-tighter sm:text-8xl lg:text-9xl"
              style={{
                background: 'linear-gradient(135deg, #6c5ce7, #a29bfe, #00cec9)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: isVisible ? 'drop-shadow(0 0 40px rgba(108, 92, 231, 0.3))' : 'none',
                transition: 'filter 1s ease 0.5s',
              }}
            >
              {animatedValue.toFixed(value % 1 === 0 ? 0 : 1)}x
            </span>
          </div>

          {/* Subtitle */}
          <p
            className={cn(
              'mt-6 text-lg text-cme-text-muted max-w-lg transition-all duration-700 delay-500',
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
          >
            Your content reached{' '}
            <span className="font-semibold text-cme-text">
              {formatNumber(Math.round(animatedReach))}
            </span>{' '}
            people across{' '}
            <span className="font-semibold text-cme-text">
              {platformCount}
            </span>{' '}
            platforms
          </p>
        </div>
      </Card>

      {/* Top Content Mini-Cards */}
      {topContent.length > 0 && (
        <div
          className={cn(
            'mt-4 grid gap-3 sm:grid-cols-3 transition-all duration-700 delay-700',
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          )}
        >
          {topContent.slice(0, 3).map((content, index) => (
            <Link
              key={content.content_id}
              href={`/analytics/${content.content_id}`}
            >
              <Card
                className={cn(
                  'group relative overflow-hidden transition-all duration-300',
                  'hover:border-cme-primary/30 cursor-pointer',
                  index === 0 && 'sm:border-cme-primary/20'
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cme-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center gap-3 p-4">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold',
                      index === 0
                        ? 'bg-cme-primary/20 text-cme-primary'
                        : 'bg-cme-surface-hover text-cme-text-muted'
                    )}
                  >
                    #{index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-cme-text group-hover:text-white transition-colors">
                      {content.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs font-mono text-cme-primary font-semibold">
                        {content.multiplier_value}x
                      </span>
                      <span className="text-xs text-cme-text-muted">
                        {formatNumber(content.total_reach)} reach
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-cme-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export { MultiplierScoreHero };
export type { MultiplierScoreHeroProps, TopContentItem };
