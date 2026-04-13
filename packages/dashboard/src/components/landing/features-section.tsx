'use client';

import {
  GitPullRequest,
  Clock,
  Sparkles,
  Target,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { useScrollAnimation } from './use-scroll-animation';

const features = [
  {
    icon: GitPullRequest,
    title: 'Meeting to Code Tracker',
    description:
      'See which meeting decisions became code. Link discussions to commits automatically.',
  },
  {
    icon: Clock,
    title: 'Developer Timeline',
    description:
      'Chronological feed of everything each developer does across all tools.',
  },
  {
    icon: Sparkles,
    title: 'AI Usage Intelligence',
    description:
      'Track every AI prompt, response, token, and cost per developer.',
  },
  {
    icon: Target,
    title: 'Prompt Quality Scoring',
    description:
      'Score prompts 0-100 with intent-aware analysis. Find coaching opportunities.',
  },
  {
    icon: FileText,
    title: 'Daily Auto-Reports',
    description:
      'Auto-generated standups from real activity. Developers write nothing.',
  },
  {
    icon: AlertTriangle,
    title: 'Smart Alerts',
    description:
      'Know when tasks stall, costs spike, or sprints derail before it is too late.',
  },
];

export function FeaturesSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="features" className="py-24 relative scroll-mt-20">
      {/* Background accent */}
      <div className="pointer-events-none absolute top-0 right-0 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(139,92,246,0.05)_0%,transparent_70%)]" />

      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-purple-400 mb-3">
            Features
          </span>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Everything you need to see the real picture
          </h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">
            Automatically capture what matters. No forms, no standups, no busywork.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className={`group relative bg-white/[0.03] backdrop-blur-sm border border-border-primary rounded-2xl p-6 hover:border-purple-500/30 hover:bg-white/[0.05] transition-all duration-500 ${
                isVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: isVisible ? `${i * 80}ms` : '0ms' }}
            >
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(400px_at_50%_0%,rgba(139,92,246,0.06),transparent)]" />

              <div className="relative">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 group-hover:bg-purple-500/15 group-hover:border-purple-500/30 transition-colors">
                  <feature.icon className="h-5 w-5 text-purple-400" />
                </div>
                <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
