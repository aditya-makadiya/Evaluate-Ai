'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useScrollAnimation } from './use-scroll-animation';

export function CtaSection() {
  const { ref, isVisible } = useScrollAnimation();
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      window.location.href = `/auth/signup?email=${encodeURIComponent(email)}`;
    }
  };

  return (
    <section ref={ref} className="py-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.1)_0%,transparent_70%)]" />
      </div>

      <div
        className={`max-w-3xl mx-auto px-6 text-center relative z-10 transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Start tracking your team&apos;s{' '}
          <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            real output
          </span>{' '}
          today
        </h2>
        <p className="text-text-secondary text-lg mb-10 max-w-lg mx-auto">
          Set up in 2 minutes. See results immediately.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto mb-4"
        >
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 w-full sm:w-auto bg-bg-input border border-border-primary rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            className="group w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6 py-3 text-sm font-semibold transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </form>

        <p className="text-xs text-text-muted">
          No credit card required. Free for up to 3 developers.
        </p>
      </div>
    </section>
  );
}
