'use client';

import { useState } from 'react';
import { X, Zap, LayoutGrid, Mic, CalendarDays, Sparkles, Rocket } from 'lucide-react';
import { callFunction } from '@/lib/cloud-functions';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';

interface WaitlistModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const GROWTH_FEATURES = [
  { icon: Zap, label: 'Unlimited analyses' },
  { icon: Sparkles, label: 'Unlimited generations' },
  { icon: LayoutGrid, label: 'All 18 platforms' },
  { icon: Mic, label: 'Voice profiles' },
  { icon: CalendarDays, label: 'Content calendar' },
  { icon: Rocket, label: 'Priority processing' },
  ];

export function WaitlistModal({ isOpen, onClose }: WaitlistModalProps) {
    const { user } = useAuthStore();
    const { success, error } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [joined, setJoined] = useState(false);

  // Check if user already joined from profile
  const alreadyJoined = (user as any)?.waitlistJoined === true;

  if (!isOpen) return null;

  const handleJoinWaitlist = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
                await callFunction('joinWaitlist', {
                          plan: 'growth',
                          source: 'upgrade-modal',
                });
                setJoined(true);
                success('You\'re on the list!', 'We\'ll notify you when Growth is ready.');
        } catch (err) {
                error('Something went wrong', 'Please try again later.');
        } finally {
                setIsSubmitting(false);
        }
  };

  // Show confirmation state if already joined or just joined
  if (alreadyJoined || joined) {
        return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                        <div className="relative w-full max-w-md rounded-2xl bg-cme-surface border border-cme-border p-6 shadow-2xl">
                                  <button
                                                onClick={onClose}
                                                className="absolute right-4 top-4 text-cme-text-muted hover:text-cme-text transition-colors"
                                                aria-label="Close"
                                              >
                                              <X className="h-5 w-5" />
                                  </button>button>
                        
                                  <div className="text-center space-y-4">
                                              <div className="text-4xl">&#9989;</div>div>
                                              <h2 className="text-xl font-bold text-cme-text">You&apos;re on the list!</h2>h2>
                                              <p className="text-cme-text-muted text-sm">
                                                            We&apos;ll email you at{' '}
                                                            <span className="text-cme-text font-medium">{user?.email}</span>span>{' '}
                                                            when Growth is ready.
                                              </p>p>
                                              <p className="text-cme-text-muted text-sm">
                                                            In the meantime, keep creating &mdash; your free plan resets monthly.
                                              </p>p>
                                              <button
                                                              onClick={onClose}
                                                              className="w-full mt-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 px-4 transition-colors"
                                                            >
                                                            Got it
                                              </button>button>
                                  </div>div>
                        </div>div>
                </div>div>
              );
  }
  
    return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                <div className="relative w-full max-w-md rounded-2xl bg-cme-surface border border-cme-border p-6 shadow-2xl">
                        <button
                                    onClick={onClose}
                                    className="absolute right-4 top-4 text-cme-text-muted hover:text-cme-text transition-colors"
                                    aria-label="Close"
                                  >
                                  <X className="h-5 w-5" />
                        </button>button>
                
                        <div className="space-y-5">
                          {/* Header */}
                                  <div className="text-center">
                                              <div className="text-2xl mb-2">&#128640;</div>div>
                                              <h2 className="text-xl font-bold text-cme-text">
                                                            Growth Plan &mdash; Coming Soon
                                              </h2>h2>
                                              <p className="text-cme-text-muted text-sm mt-2">
                                                            We&apos;re putting the finishing touches on the Growth plan. Join the
                                                            waitlist and we&apos;ll notify you when it&apos;s ready &mdash; plus
                                                            early supporters get 50% off their first 3 months.
                                              </p>p>
                                  </div>div>
                        
                          {/* Features */}
                                  <div className="grid grid-cols-2 gap-2">
                                    {GROWTH_FEATURES.map((feature) => (
                          <div
                                            key={feature.label}
                                            className="flex items-center gap-2 rounded-lg bg-cme-surface-hover p-2.5 text-sm"
                                          >
                                          <feature.icon className="h-4 w-4 text-purple-400 shrink-0" />
                                          <span className="text-cme-text">{feature.label}</span>span>
                          </div>div>
                        ))}
                                  </div>div>
                        
                          {/* Price */}
                                  <div className="text-center">
                                              <p className="text-cme-text-muted text-sm">
                                                            <span className="line-through">$29/mo</span>span>
                                                            <span className="text-purple-400 font-bold ml-2">
                                                                            $14.50/mo for early supporters
                                                            </span>span>
                                              </p>p>
                                  </div>div>
                        
                          {/* CTA */}
                                  <button
                                                onClick={handleJoinWaitlist}
                                                disabled={isSubmitting}
                                                className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 transition-colors"
                                              >
                                    {isSubmitting ? 'Joining...' : 'Join the Waitlist'}
                                  </button>button>
                        </div>div>
                </div>div>
          </div>div>
        );
}

export default WaitlistModal;</div>
