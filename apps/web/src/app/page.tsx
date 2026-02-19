'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import {
  Upload,
  Dna,
  LayoutGrid,
  Check,
  ArrowRight,
  Sparkles,
  Zap,
  Crown,
  ChevronDown,
  Mail,
  Twitter,
  MessageCircle,
} from 'lucide-react';

/* ─────────────────────────── constants ─────────────────────────── */

const PLATFORMS = [
  { name: 'Twitter / X', emoji: '𝕏' },
  { name: 'LinkedIn', emoji: '💼' },
  { name: 'Instagram', emoji: '📸' },
  { name: 'TikTok', emoji: '🎵' },
  { name: 'YouTube Shorts', emoji: '▶️' },
  { name: 'Facebook', emoji: '👥' },
  { name: 'Threads', emoji: '🧵' },
  { name: 'Bluesky', emoji: '🦋' },
  { name: 'Mastodon', emoji: '🐘' },
  { name: 'Medium', emoji: '✍️' },
  { name: 'Substack', emoji: '📰' },
  { name: 'Newsletter', emoji: '📧' },
  { name: 'Reddit', emoji: '🤖' },
  { name: 'Pinterest', emoji: '📌' },
  { name: 'Podcast Notes', emoji: '🎙️' },
  { name: 'Blog Summary', emoji: '📝' },
  { name: 'LinkedIn Newsletter', emoji: '📮' },
  { name: 'Discord', emoji: '💬' },
];

const STORAGE_KEY = 'pandocast_waitlist';

/* ─────────────────────── helper: save email ────────────────────── */

function saveEmail(email: string): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (list.includes(email)) return false;
    list.push(email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/* ──────────────── helper: intersection observer hook ────────────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

/* ──────────────────── helper: email form hook ──────────────────── */

function useEmailForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { success, error } = useToast();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        error('Invalid email', 'Please enter a valid email address.');
        return;
      }
      const isNew = saveEmail(trimmed);
      if (isNew) {
        success('You\'re on the list!', 'We\'ll notify you when Pandocast launches.');
      } else {
        success('Already registered', 'This email is already on the waitlist.');
      }
      setSubmitted(true);
      setEmail('');
      setTimeout(() => setSubmitted(false), 4000);
    },
    [email, success, error]
  );

  return { email, setEmail, submitted, handleSubmit };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const [ready, setReady] = useState(false);

  // Initialize auth and redirect if logged in
  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace(ROUTES.DASHBOARD);
      } else {
        setReady(true);
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Show nothing while checking auth
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cme-bg">
        <div className="gradient-text text-4xl font-bold tracking-wider animate-pulse">
          PANDO
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-cme-bg">
      {/* Floating nav */}
      <Nav />

      {/* Sections */}
      <HeroSection />
      <HowItWorksSection />
      <PlatformGridSection />
      <MultiplierSection />
      <PandoStorySection />
      <PricingSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════════════════════════════ */

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'glass py-3 shadow-lg shadow-black/30'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
          <span className="gradient-text text-xl font-bold tracking-wider">PANDO</span>
        </button>
        <div className="hidden items-center gap-6 md:flex">
          {[
            ['How it works', 'how-it-works'],
            ['Platforms', 'platforms'],
            ['Pricing', 'pricing'],
            ['Story', 'story'],
          ].map(([label, id]) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="text-sm text-cme-text-muted transition-colors hover:text-cme-text"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={ROUTES.LOGIN}
            className="text-sm text-cme-text-muted transition-colors hover:text-cme-text"
          >
            Log in
          </a>
          <button
            onClick={() => document.getElementById('hero-email')?.focus()}
            className="rounded-lg bg-cme-primary px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(108,92,231,0.25)] transition-all hover:bg-cme-primary-hover hover:shadow-[0_0_30px_rgba(108,92,231,0.4)] active:scale-[0.97]"
          >
            Join Waitlist
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   1. HERO SECTION
   ═══════════════════════════════════════════════════════════════════ */

function HeroSection() {
  const { email, setEmail, submitted, handleSubmit } = useEmailForm();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      id="hero"
      className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20"
    >
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="mesh-orb mesh-orb-1" />
        <div className="mesh-orb mesh-orb-2" />
        <div className="mesh-orb mesh-orb-3" />
        {/* Extra orbs for richer background */}
        <div
          className="absolute rounded-full opacity-20"
          style={{
            width: 500,
            height: 500,
            background: 'radial-gradient(circle, rgba(108,92,231,0.25), transparent 70%)',
            top: '60%',
            left: '10%',
            filter: 'blur(100px)',
            animation: 'mesh-float 25s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute rounded-full opacity-15"
          style={{
            width: 400,
            height: 400,
            background: 'radial-gradient(circle, rgba(0,206,201,0.2), transparent 70%)',
            top: '20%',
            right: '5%',
            filter: 'blur(120px)',
            animation: 'mesh-float 30s ease-in-out infinite',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* Badge */}
        <div
          className={`mb-8 inline-flex items-center gap-2 rounded-full border border-cme-border px-4 py-1.5 text-xs text-cme-text-muted transition-all duration-700 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-cme-secondary" />
          <span>Early Access Open</span>
        </div>

        {/* Main title */}
        <h1
          className={`mb-6 transition-all duration-700 delay-100 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <span
            className="block text-[clamp(4rem,12vw,9rem)] font-bold leading-[0.9] tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #00cec9 0%, #6c5ce7 40%, #a855f7 70%, #00cec9 100%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'shimmer 4s linear infinite',
            }}
          >
            PANDO
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className={`mb-4 text-xl font-medium text-cme-text md:text-2xl transition-all duration-700 delay-200 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          Upload once. Pando everywhere.
        </p>

        {/* Description */}
        <p
          className={`mb-10 max-w-xl text-base text-cme-text-muted md:text-lg transition-all duration-700 delay-300 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          One upload becomes 18 platform-native posts — all in your voice, ready to publish.
        </p>

        {/* Email CTA */}
        <form
          onSubmit={handleSubmit}
          className={`mb-6 flex w-full max-w-md flex-col items-center gap-3 sm:flex-row transition-all duration-700 delay-[400ms] ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <div className="relative w-full flex-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cme-text-muted" />
            <input
              id="hero-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-lg border border-cme-border bg-cme-surface pl-10 pr-4 text-sm text-cme-text placeholder:text-cme-text-muted transition-all duration-200 focus:border-cme-primary focus:outline-none focus:ring-2 focus:ring-cme-primary/50"
            />
          </div>
          <button
            type="submit"
            disabled={submitted}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cme-primary px-6 text-sm font-semibold text-white shadow-[0_0_25px_rgba(108,92,231,0.3)] transition-all duration-200 hover:bg-cme-primary-hover hover:shadow-[0_0_40px_rgba(108,92,231,0.45)] active:scale-[0.97] disabled:opacity-70 sm:w-auto"
          >
            {submitted ? (
              <>
                <Check className="h-4 w-4" />
                You&apos;re in!
              </>
            ) : (
              <>
                Join the Waitlist
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Social proof */}
        <p
          className={`flex items-center gap-2 text-sm text-cme-text-muted transition-all duration-700 delay-500 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          <span className="flex -space-x-1.5">
            {[
              'bg-gradient-to-br from-purple-500 to-blue-500',
              'bg-gradient-to-br from-cyan-500 to-emerald-500',
              'bg-gradient-to-br from-violet-500 to-pink-500',
              'bg-gradient-to-br from-amber-500 to-orange-500',
            ].map((bg, i) => (
              <span
                key={i}
                className={`inline-block h-6 w-6 rounded-full border-2 border-cme-bg ${bg}`}
              />
            ))}
          </span>
          Join <span className="font-semibold text-cme-text">2,400+</span> creators in early access
        </p>
      </div>

      {/* Scroll indicator */}
      <button
        onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
        className={`absolute bottom-10 animate-bounce text-cme-text-muted transition-all duration-700 delay-700 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Scroll down"
      >
        <ChevronDown className="h-6 w-6" />
      </button>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2. HOW IT WORKS
   ═══════════════════════════════════════════════════════════════════ */

function HowItWorksSection() {
  const { ref, isVisible } = useInView();

  const steps = [
    {
      num: 1,
      title: 'Upload',
      desc: 'Upload your blog, video, or podcast. One piece of content is all it takes.',
      icon: Upload,
      color: 'from-cyan-400 to-cyan-600',
      glow: 'rgba(0,206,201,0.25)',
    },
    {
      num: 2,
      title: 'Analyze',
      desc: 'AI extracts your content\'s DNA and learns your unique voice and style.',
      icon: Dna,
      color: 'from-violet-400 to-purple-600',
      glow: 'rgba(108,92,231,0.25)',
    },
    {
      num: 3,
      title: 'Pando',
      desc: 'Get 18 platform-native posts, perfectly formatted and ready to publish.',
      icon: LayoutGrid,
      color: 'from-purple-400 to-pink-600',
      glow: 'rgba(168,85,247,0.25)',
    },
  ];

  return (
    <section id="how-it-works" className="relative py-28 px-6" ref={ref}>
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <div
          className={`mb-16 text-center transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-cme-secondary">
            How it works
          </p>
          <h2 className="text-3xl font-bold text-cme-text md:text-4xl">
            Three steps. <span className="gradient-text">Infinite reach.</span>
          </h2>
        </div>

        {/* Steps grid */}
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className={`group relative rounded-2xl border border-cme-border bg-cme-surface/60 p-8 text-center backdrop-blur-sm transition-all duration-700 hover:border-cme-border-bright hover:bg-cme-surface-hover ${
                  isVisible
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-12 opacity-0'
                }`}
                style={{ transitionDelay: isVisible ? `${i * 150 + 200}ms` : '0ms' }}
              >
                {/* Glow on hover */}
                <div
                  className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${step.glow}, transparent 70%)`,
                  }}
                />

                {/* Numbered circle */}
                <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full opacity-30 blur-xl"
                    style={{ background: `linear-gradient(135deg, ${step.glow}, transparent)` }}
                  />
                  <div
                    className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${step.color}`}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                </div>

                {/* Step number */}
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cme-text-muted">
                  Step {step.num}
                </p>

                <h3 className="mb-3 text-xl font-bold text-cme-text">{step.title}</h3>
                <p className="text-sm leading-relaxed text-cme-text-muted">{step.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Connecting lines (desktop only) */}
        <div className="pointer-events-none absolute top-1/2 left-0 right-0 hidden -translate-y-1/2 md:block">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex justify-between px-[calc(16.67%-1rem)]">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-px flex-1 bg-gradient-to-r from-cme-border-bright via-cme-primary/30 to-cme-border-bright"
                  style={{ margin: '0 2rem' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3. PLATFORM GRID
   ═══════════════════════════════════════════════════════════════════ */

function PlatformGridSection() {
  const { ref, isVisible } = useInView();

  return (
    <section id="platforms" className="relative py-28 px-6" ref={ref}>
      {/* Background accent */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10"
          style={{
            width: 800,
            height: 800,
            background: 'radial-gradient(circle, rgba(108,92,231,0.4), transparent 60%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl">
        {/* Section header */}
        <div
          className={`mb-16 text-center transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-cme-secondary">
            One upload. Every platform.
          </p>
          <h2 className="text-3xl font-bold text-cme-text md:text-4xl">
            18 platforms. <span className="gradient-text">Zero reformatting.</span>
          </h2>
          <p className="mt-4 text-cme-text-muted">
            Each post is native to its platform — not a lazy copy-paste.
          </p>
        </div>

        {/* Platform grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {PLATFORMS.map((p, i) => (
            <div
              key={p.name}
              className={`group flex flex-col items-center gap-2 rounded-xl border border-cme-border bg-cme-surface/50 px-3 py-4 backdrop-blur-sm transition-all duration-500 hover:border-cme-border-bright hover:bg-cme-surface-hover hover:shadow-[0_0_20px_rgba(108,92,231,0.1)] ${
                isVisible
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-8 opacity-0'
              }`}
              style={{ transitionDelay: isVisible ? `${i * 40 + 200}ms` : '0ms' }}
            >
              <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
                {p.emoji}
              </span>
              <span className="text-center text-xs font-medium text-cme-text-muted transition-colors group-hover:text-cme-text">
                {p.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4. MULTIPLIER SCORE
   ═══════════════════════════════════════════════════════════════════ */

function MultiplierSection() {
  const { ref, isVisible } = useInView();
  const [count, setCount] = useState(0);

  // Animate the multiplier number
  useEffect(() => {
    if (!isVisible) return;
    const target = 8.4;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(current);
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <section className="relative py-28 px-6" ref={ref}>
      <div className="mx-auto max-w-4xl">
        <div
          className={`relative overflow-hidden rounded-3xl border border-cme-border bg-cme-surface/60 p-10 backdrop-blur-sm md:p-16 transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
          }`}
        >
          {/* Background glow */}
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(108,92,231,0.6), transparent 60%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full opacity-15"
            style={{
              background: 'radial-gradient(circle, rgba(0,206,201,0.5), transparent 60%)',
              filter: 'blur(60px)',
            }}
          />

          <div className="relative flex flex-col items-center gap-10 md:flex-row md:gap-16">
            {/* Score visualization */}
            <div className="flex flex-shrink-0 flex-col items-center">
              <div className="relative">
                {/* Animated ring */}
                <svg viewBox="0 0 200 200" className="h-48 w-48 md:h-56 md:w-56">
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="rgba(30,30,58,0.6)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="url(#scoreGrad)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(count / 10) * 534} 534`}
                    transform="rotate(-90 100 100)"
                    className="transition-all duration-100"
                  />
                  <defs>
                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00cec9" />
                      <stop offset="50%" stopColor="#6c5ce7" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="text-5xl font-bold md:text-6xl"
                    style={{
                      background: 'linear-gradient(135deg, #00cec9, #6c5ce7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {count.toFixed(1)}x
                  </span>
                  <span className="text-xs font-medium uppercase tracking-widest text-cme-text-muted">
                    Multiplier
                  </span>
                </div>
              </div>
            </div>

            {/* Text */}
            <div className="text-center md:text-left">
              <p className="mb-3 text-sm font-medium uppercase tracking-widest text-cme-secondary">
                The viral hook
              </p>
              <h2 className="mb-4 text-3xl font-bold text-cme-text md:text-4xl">
                Your Multiplier Score&trade;
              </h2>
              <p className="mb-6 text-base leading-relaxed text-cme-text-muted">
                Most creators reach <span className="font-semibold text-cme-text">12%</span> of their
                potential audience. Pandocast shows you what you&apos;re leaving on the table — and fills
                the gap.
              </p>
              <div className="inline-flex flex-col gap-2 rounded-xl border border-cme-border bg-cme-bg/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-cme-text-muted">You reach</span>
                  <span className="font-mono text-lg font-bold text-cme-text">1,200</span>
                  <span className="text-sm text-cme-text-muted">people</span>
                </div>
                <div className="h-px bg-cme-border" />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-cme-text-muted">You could reach</span>
                  <span
                    className="font-mono text-lg font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #00cec9, #6c5ce7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    10,080
                  </span>
                  <span className="text-sm text-cme-text-muted">people</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5. THE PANDO STORY
   ═══════════════════════════════════════════════════════════════════ */

function PandoStorySection() {
  const { ref, isVisible } = useInView();

  return (
    <section id="story" className="relative py-28 px-6" ref={ref}>
      {/* Background accent */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/4 top-0 h-full w-px opacity-10"
          style={{
            background: 'linear-gradient(to bottom, transparent, rgba(0,206,201,0.4) 50%, transparent)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-4xl">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* CSS Tree/Root visual */}
          <div
            className={`flex items-center justify-center transition-all duration-700 ${
              isVisible ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'
            }`}
          >
            <div className="relative h-80 w-80">
              {/* Root system — radial dots */}
              <svg viewBox="0 0 320 320" className="h-full w-full" aria-hidden="true">
                {/* Central trunk */}
                <line
                  x1="160"
                  y1="80"
                  x2="160"
                  y2="200"
                  stroke="url(#trunkGrad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Roots spreading */}
                {[
                  'M160,200 Q130,230 90,250',
                  'M160,200 Q140,240 100,280',
                  'M160,200 Q160,250 160,300',
                  'M160,200 Q180,240 220,280',
                  'M160,200 Q190,230 230,250',
                  'M160,200 Q120,220 70,230',
                  'M160,200 Q200,220 250,230',
                ].map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke="url(#rootGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity={0.5 + i * 0.07}
                  />
                ))}

                {/* Tree canopy circles (representing the 47,000 trees) */}
                {Array.from({ length: 24 }).map((_, i) => {
                  const angle = (i / 24) * Math.PI * 2;
                  const radius = 40 + (i % 3) * 18;
                  const cx = 160 + Math.cos(angle) * radius;
                  const cy = 70 + Math.sin(angle) * (radius * 0.5);
                  const r = 4 + (i % 4) * 2;
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={i % 2 === 0 ? 'rgba(0,206,201,0.4)' : 'rgba(108,92,231,0.4)'}
                      className="animate-pulse"
                      style={{ animationDelay: `${i * 200}ms`, animationDuration: `${3 + (i % 3)}s` }}
                    />
                  );
                })}

                {/* Root node dots */}
                {[
                  [90, 250],
                  [100, 280],
                  [160, 300],
                  [220, 280],
                  [230, 250],
                  [70, 230],
                  [250, 230],
                ].map(([cx, cy], i) => (
                  <circle
                    key={`root-${i}`}
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="rgba(0,206,201,0.6)"
                    className="animate-pulse"
                    style={{ animationDelay: `${i * 300}ms` }}
                  />
                ))}

                <defs>
                  <linearGradient id="trunkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0,206,201,0.5)" />
                    <stop offset="100%" stopColor="rgba(108,92,231,0.5)" />
                  </linearGradient>
                  <linearGradient id="rootGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="rgba(108,92,231,0.5)" />
                    <stop offset="100%" stopColor="rgba(0,206,201,0.3)" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Label */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                <p className="text-xs font-medium uppercase tracking-widest text-cme-text-muted">
                  47,000 trees. One root.
                </p>
              </div>
            </div>
          </div>

          {/* Text */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
            }`}
          >
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-cme-secondary">
              The origin
            </p>
            <h2 className="mb-6 text-3xl font-bold text-cme-text md:text-4xl">
              Why <span className="gradient-text">Pando</span>?
            </h2>
            <div className="space-y-4 text-base leading-relaxed text-cme-text-muted">
              <p>
                <span className="font-semibold text-cme-text">Pando</span> is the world&apos;s largest
                living organism — a single root system in Utah that grew into{' '}
                <span className="font-semibold text-cme-text">47,000 trees</span> across 106 acres.
              </p>
              <p>One root. An entire forest.</p>
              <p>
                That&apos;s what we do with your content. One upload becomes your{' '}
                <span className="font-semibold text-cme-text">entire content ecosystem</span> —
                branching across every platform, native to each one, but all rooted in your voice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   6. PRICING
   ═══════════════════════════════════════════════════════════════════ */

function PricingSection() {
  const { ref, isVisible } = useInView();

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '/mo',
      desc: 'Get started, no strings attached.',
      features: [
        '3 uploads per month',
        '5 platforms',
        'Basic voice matching',
        '"Made with Pando" watermark',
      ],
      cta: 'Start Free',
      featured: false,
      icon: Zap,
    },
    {
      name: 'Creator',
      price: '$29',
      period: '/mo',
      desc: 'For serious content creators.',
      features: [
        '25 uploads per month',
        'All 18 platforms',
        'Brand voice profiles',
        'Content calendar',
        'No watermark',
        'Priority generation',
      ],
      cta: 'Join Waitlist',
      featured: true,
      icon: Sparkles,
    },
    {
      name: 'Pro',
      price: '$79',
      period: '/mo',
      desc: 'Scale without limits.',
      features: [
        'Unlimited uploads',
        'Autopilot scheduling',
        'A/B testing',
        'Full analytics suite',
        'Priority support',
        'API access',
      ],
      cta: 'Join Waitlist',
      featured: false,
      icon: Crown,
    },
  ];

  return (
    <section id="pricing" className="relative py-28 px-6" ref={ref}>
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <div
          className={`mb-16 text-center transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-cme-secondary">
            Pricing
          </p>
          <h2 className="text-3xl font-bold text-cme-text md:text-4xl">
            Simple, <span className="gradient-text">transparent</span> pricing
          </h2>
          <p className="mt-4 text-cme-text-muted">
            Start free. Upgrade when you&apos;re ready to go all-in.
          </p>
        </div>

        {/* Pricing grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, i) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-8 transition-all duration-700 ${
                  plan.featured
                    ? 'border-cme-primary/50 bg-cme-surface/80 shadow-[0_0_40px_rgba(108,92,231,0.15)]'
                    : 'border-cme-border bg-cme-surface/50'
                } backdrop-blur-sm hover:border-cme-border-bright ${
                  isVisible
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-12 opacity-0'
                }`}
                style={{ transitionDelay: isVisible ? `${i * 150 + 200}ms` : '0ms' }}
              >
                {/* Recommended badge */}
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cme-primary px-4 py-1 text-xs font-semibold text-white shadow-[0_0_20px_rgba(108,92,231,0.3)]">
                    Most Popular
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        plan.featured
                          ? 'bg-cme-primary/20 text-cme-primary'
                          : 'bg-cme-surface-hover text-cme-text-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-cme-text">{plan.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-cme-text">{plan.price}</span>
                    <span className="text-sm text-cme-text-muted">{plan.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-cme-text-muted">{plan.desc}</p>
                </div>

                {/* Divider */}
                <div className="mb-6 h-px bg-cme-border" />

                {/* Features */}
                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <Check
                        className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                          plan.featured ? 'text-cme-primary' : 'text-cme-secondary'
                        }`}
                      />
                      <span className="text-cme-text-muted">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <button
                  onClick={() => document.getElementById('final-cta-email')?.focus()}
                  className={`w-full rounded-lg py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
                    plan.featured
                      ? 'bg-cme-primary text-white shadow-[0_0_25px_rgba(108,92,231,0.3)] hover:bg-cme-primary-hover hover:shadow-[0_0_35px_rgba(108,92,231,0.4)]'
                      : 'border border-cme-border bg-transparent text-cme-text hover:bg-cme-surface-hover hover:border-cme-border-bright'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   7. FINAL CTA
   ═══════════════════════════════════════════════════════════════════ */

function FinalCTASection() {
  const { ref, isVisible } = useInView();
  const { email, setEmail, submitted, handleSubmit } = useEmailForm();

  return (
    <section className="relative py-28 px-6" ref={ref}>
      <div className="mx-auto max-w-3xl">
        <div
          className={`relative overflow-hidden rounded-3xl border border-cme-border bg-cme-surface/60 p-10 text-center backdrop-blur-sm md:p-16 transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
          }`}
        >
          {/* Background glows */}
          <div
            className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(0,206,201,0.5), transparent 60%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="pointer-events-none absolute -bottom-32 -right-32 h-64 w-64 rounded-full opacity-20"
            style={{
              background: 'radial-gradient(circle, rgba(108,92,231,0.5), transparent 60%)',
              filter: 'blur(60px)',
            }}
          />

          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold text-cme-text md:text-4xl">
              Ready to <span className="gradient-text">Pando</span> your content?
            </h2>
            <p className="mb-8 text-base text-cme-text-muted md:text-lg">
              Stop creating for one platform. Start reaching everywhere.
            </p>

            {/* Email form */}
            <form
              onSubmit={handleSubmit}
              className="mx-auto mb-6 flex max-w-md flex-col items-center gap-3 sm:flex-row"
            >
              <div className="relative w-full flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cme-text-muted" />
                <input
                  id="final-cta-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 w-full rounded-lg border border-cme-border bg-cme-bg/80 pl-10 pr-4 text-sm text-cme-text placeholder:text-cme-text-muted transition-all duration-200 focus:border-cme-primary focus:outline-none focus:ring-2 focus:ring-cme-primary/50"
                />
              </div>
              <button
                type="submit"
                disabled={submitted}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cme-primary px-6 text-sm font-semibold text-white shadow-[0_0_25px_rgba(108,92,231,0.3)] transition-all duration-200 hover:bg-cme-primary-hover hover:shadow-[0_0_40px_rgba(108,92,231,0.45)] active:scale-[0.97] disabled:opacity-70 sm:w-auto"
              >
                {submitted ? (
                  <>
                    <Check className="h-4 w-4" />
                    You&apos;re in!
                  </>
                ) : (
                  <>
                    Get Early Access
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="text-sm text-cme-text-muted">
              No credit card required. Free tier forever.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   8. FOOTER
   ═══════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="border-t border-cme-border px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 md:flex-row md:justify-between">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 md:items-start">
          <span className="gradient-text text-lg font-bold tracking-wider">PANDOCAST</span>
          <p className="text-xs text-cme-text-muted">Made with ambition in San Francisco</p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-sm text-cme-text-muted">
          <a href="#" className="transition-colors hover:text-cme-text">
            Privacy
          </a>
          <a href="#" className="transition-colors hover:text-cme-text">
            Terms
          </a>
          <a
            href="https://twitter.com/pandocast"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-cme-text"
          >
            <Twitter className="h-4 w-4" />
          </a>
          <a href="mailto:hello@pandocast.ai" className="transition-colors hover:text-cme-text">
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>

        {/* Copyright */}
        <p className="text-xs text-cme-text-muted">
          &copy; 2026 Pandocast. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
