'use client';

import { useScrollAnimation } from './use-scroll-animation';

export function LogosSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-16 border-y border-border-primary">
      <div
        className={`max-w-5xl mx-auto px-6 transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-text-muted mb-8">
          Trusted by engineering teams at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-8 w-24 rounded-md bg-bg-elevated opacity-40"
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
