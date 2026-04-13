'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useScrollAnimation } from './use-scroll-animation';

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
}

const plans: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For small teams getting started',
    features: [
      'Up to 3 developers',
      'GitHub integration',
      'Basic activity timeline',
      'AI usage tracking',
      '7-day data retention',
      'Community support',
    ],
  },
  {
    name: 'Team',
    price: '$15',
    period: '/user/mo',
    description: 'For growing engineering teams',
    popular: true,
    features: [
      'Unlimited developers',
      'All integrations (GitHub, Jira, Fireflies)',
      'Prompt quality scoring',
      'Daily auto-reports',
      'Smart alerts',
      'Meeting-to-code tracking',
      '90-day data retention',
      'Priority support',
    ],
  },
  {
    name: 'Business',
    price: '$29',
    period: '/user/mo',
    description: 'For enterprise-scale visibility',
    features: [
      'Everything in Team',
      'SSO / SAML',
      'Custom integrations API',
      'Advanced analytics & exports',
      'Cost allocation reports',
      'Unlimited data retention',
      'Dedicated account manager',
      'SLA guarantee',
    ],
  },
];

export function PricingSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section ref={ref} id="pricing" className="py-24 relative scroll-mt-20">
      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-purple-400 mb-3">
            Pricing
          </span>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">
            Start free. Upgrade when your team grows.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => {
            const cardBase =
              'relative bg-white/[0.03] backdrop-blur-sm border rounded-2xl p-8 transition-all duration-500 flex flex-col';
            const cardBorder = plan.popular
              ? 'border-purple-500/40 shadow-[0_0_40px_rgba(139,92,246,0.12)]'
              : 'border-border-primary hover:border-border-hover';

            return (
              <div
                key={plan.name}
                className={`${cardBase} ${cardBorder} ${
                  isVisible
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-8'
                }`}
                style={{
                  transitionDelay: isVisible ? `${i * 120}ms` : '0ms',
                }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-1">{plan.name}</h3>
                  <p className="text-sm text-text-muted mb-4">
                    {plan.description}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-sm text-text-muted">
                      {plan.period}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-text-secondary"
                    >
                      <Check className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth/signup"
                  className={`block text-center rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
                    plan.popular
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.25)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)]'
                      : 'border border-border-primary bg-white/[0.03] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary hover:border-border-hover'
                  }`}
                >
                  Start Free
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
