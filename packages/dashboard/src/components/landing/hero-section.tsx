'use client';

import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background Effects */}
      <div className="pointer-events-none absolute inset-0">
        {/* Purple gradient orb */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.12)_0%,rgba(139,92,246,0.04)_40%,transparent_70%)]" />

        {/* Secondary blue orb */}
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(59,130,246,0.06)_0%,transparent_70%)]" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(var(--border-primary) 1px, transparent 1px), linear-gradient(90deg, var(--border-primary) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-bg-primary to-transparent" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 mb-8 animate-[slideUp_0.5s_ease-out_both]">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
          <span className="text-xs font-medium text-purple-400">
            Now tracking AI usage and developer productivity
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6 animate-[slideUp_0.6s_ease-out_0.1s_both]">
          <span className="bg-gradient-to-r from-text-primary via-text-primary to-text-secondary bg-clip-text text-transparent">
            Know What Your Team Ships.
          </span>
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-purple-500 to-blue-500 bg-clip-text text-transparent">
            Not What They Say.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed animate-[slideUp_0.6s_ease-out_0.2s_both]">
          Connect meetings, GitHub, and AI tools to see the real picture.
          Track developer productivity with zero manual reporting.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-[slideUp_0.6s_ease-out_0.3s_both]">
          <Link
            href="/auth/signup"
            className="group flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-8 py-3.5 text-base font-semibold transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_50px_rgba(139,92,246,0.5)] hover:scale-[1.02]"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="#features"
            className="group flex items-center gap-2 border border-border-primary bg-white/[0.03] backdrop-blur-sm rounded-xl px-8 py-3.5 text-base font-medium text-text-secondary hover:text-text-primary hover:border-border-hover hover:bg-white/[0.06] transition-all"
          >
            <Play className="h-4 w-4" />
            See Demo
          </a>
        </div>

        {/* Trust signal */}
        <p className="text-xs text-text-muted mt-6 animate-[slideUp_0.6s_ease-out_0.4s_both]">
          No credit card required &middot; Free for up to 3 developers
        </p>
      </div>
    </section>
  );
}
