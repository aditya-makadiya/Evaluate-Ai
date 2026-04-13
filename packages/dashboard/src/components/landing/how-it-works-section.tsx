'use client';

import { GitBranch, Activity, BarChart3 } from 'lucide-react';
import { useScrollAnimation } from './use-scroll-animation';

const steps = [
  {
    number: '01',
    title: 'Connect',
    description: 'Link your existing tools in 2 minutes',
    detail: 'GitHub + Fireflies + Jira',
    icon: GitBranch,
    color: 'from-purple-500 to-purple-700',
    glow: 'rgba(139,92,246,0.15)',
  },
  {
    number: '02',
    title: 'Track',
    description: 'Every commit, PR, AI prompt captured automatically',
    detail: 'Activity timeline',
    icon: Activity,
    color: 'from-blue-500 to-blue-700',
    glow: 'rgba(59,130,246,0.15)',
  },
  {
    number: '03',
    title: 'Optimize',
    description: "See who's aligned, who's stuck, where money goes",
    detail: 'Dashboard intelligence',
    icon: BarChart3,
    color: 'from-cyan-500 to-cyan-700',
    glow: 'rgba(6,182,212,0.15)',
  },
];

export function HowItWorksSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} className="py-24 relative">
      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            How It Works
          </h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">
            Three steps to complete visibility into your engineering team.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`relative group transition-all duration-700 ${
                isVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: isVisible ? `${i * 150}ms` : '0ms' }}
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-16 left-[calc(100%_-_12px)] w-[calc(100%_-_80px)] h-px bg-gradient-to-r from-border-hover to-transparent z-0" />
              )}

              <div className="relative bg-white/[0.03] backdrop-blur-sm border border-border-primary rounded-2xl p-8 hover:border-border-hover transition-all duration-300 hover:bg-white/[0.05] group-hover:shadow-[0_0_40px_var(--glow)]"
                style={{ '--glow': step.glow } as React.CSSProperties}
              >
                {/* Step number */}
                <span className="text-xs font-mono text-text-muted tracking-wider mb-4 block">
                  STEP {step.number}
                </span>

                {/* Icon */}
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-5 shadow-lg`}>
                  <step.icon className="h-6 w-6 text-white" />
                </div>

                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed mb-3">
                  {step.description}
                </p>
                <p className="text-xs font-mono text-text-muted">
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
