'use client';

import { useState } from 'react';
import {
  BookOpen,
  Terminal,
  Download,
  LogIn,
  BarChart3,
  Upload,
  Users,
  Settings,
  Play,
  Copy,
  Check,
  ChevronRight,
  Zap,
  Shield,
  Lightbulb,
  Rocket,
} from 'lucide-react';

interface CommandDoc {
  name: string;
  description: string;
  usage: string;
  flags?: { flag: string; description: string }[];
  examples?: string[];
  notes?: string;
}

const CLI_COMMANDS: CommandDoc[] = [
  {
    name: 'setup',
    description: 'One-command onboarding: authenticates with EvaluateAI and installs Claude Code hooks in a single step. Recommended for new installs.',
    usage: 'evalai setup [options]',
    flags: [
      { flag: '--token <token>', description: 'Skip browser OAuth and authenticate with an API token (for CI/CD, Docker, or the dashboard one-liner)' },
      { flag: '--api-url <url>', description: 'Override the API URL (for self-hosted dashboards)' },
      { flag: '--force', description: 'Re-authenticate even if already logged in' },
      { flag: '--skip-hooks', description: 'Only authenticate; install Claude Code hooks later with `evalai init`' },
    ],
    examples: [
      'evalai setup',
      'evalai setup --token eai_abc123...',
      'evalai setup --skip-hooks',
      'evalai setup --force',
    ],
    notes: 'Equivalent to running `evalai login` then `evalai init`. Generate the token under Profile > CLI & API Keys, then use the `--token` form for zero-browser installs.',
  },
  {
    name: 'init',
    description: 'Install EvaluateAI hooks into Claude Code. This sets up automatic session tracking, prompt scoring, and usage monitoring. Use `evalai setup` if you also need to authenticate.',
    usage: 'evalai init',
    flags: [
      { flag: '--check', description: 'Verify hook installation + auth status without modifying anything' },
      { flag: '--uninstall', description: 'Remove all EvaluateAI hooks from Claude Code' },
    ],
    examples: [
      'evalai init',
      'evalai init --check',
      'evalai init --uninstall',
    ],
    notes: 'Run this once after installing the CLI. Hooks are installed into ~/.claude/settings.json. Requires a prior `evalai login` (or use `evalai setup` for a one-step install).',
  },
  {
    name: 'login',
    description: 'Authenticate with EvaluateAI. Opens a browser window for OAuth login and stores credentials locally.',
    usage: 'evalai login',
    flags: [
      { flag: '--token <key>', description: 'Login with a CLI API key (for CI/CD environments)' },
    ],
    examples: [
      'evalai login',
      'evalai login --token eai_abc123...',
    ],
    notes: 'API keys can be generated from Profile > CLI & API Keys in the dashboard.',
  },
  {
    name: 'logout',
    description: 'Log out and remove saved credentials from your machine.',
    usage: 'evalai logout',
  },
  {
    name: 'whoami',
    description: 'Show your current login status, team, and role.',
    usage: 'evalai whoami',
    examples: ['evalai whoami'],
  },
  {
    name: 'stats',
    description: 'View your AI usage statistics including session count, costs, average scores, and top anti-patterns.',
    usage: 'evalai stats [options]',
    flags: [
      { flag: '--period <week|month>', description: 'Time period to show stats for (default: week)' },
      { flag: '--compare', description: 'Compare current period with previous period' },
    ],
    examples: [
      'evalai stats',
      'evalai stats --period month',
      'evalai stats --compare',
    ],
  },
  {
    name: 'sessions',
    description: 'Browse your AI sessions. Shows a list of recent sessions with model, turns, cost, and score.',
    usage: 'evalai sessions [session-id]',
    flags: [
      { flag: '--limit <n>', description: 'Number of sessions to show (default: 10)' },
    ],
    examples: [
      'evalai sessions',
      'evalai sessions abc123',
      'evalai sessions --limit 20',
    ],
  },
  {
    name: 'export',
    description: 'Export your session data to CSV format for external analysis.',
    usage: 'evalai export [options]',
    flags: [
      { flag: '--output <file>', description: 'Output file path (default: stdout)' },
      { flag: '--format <csv|json>', description: 'Export format (default: csv)' },
    ],
    examples: [
      'evalai export > sessions.csv',
      'evalai export --output report.csv',
    ],
  },
  {
    name: 'team',
    description: 'Show your team information including member list, roles, and EvaluateAI installation status.',
    usage: 'evalai team',
    examples: ['evalai team'],
  },
  {
    name: 'config',
    description: 'View or update EvaluateAI configuration settings like privacy mode and scoring method.',
    usage: 'evalai config [key] [value]',
    flags: [
      { flag: 'key', description: 'Config key to get/set (privacy, scoring, threshold)' },
      { flag: 'value', description: 'New value to set' },
    ],
    examples: [
      'evalai config',
      'evalai config privacy',
      'evalai config scoring heuristic',
      'evalai config threshold 60',
    ],
  },
  {
    name: 'sync',
    description: 'Manually trigger data sync to Supabase cloud. Note: hooks now sync in real-time, so this is rarely needed.',
    usage: 'evalai sync',
    notes: 'This command is deprecated as hooks handle real-time sync automatically.',
  },
];

function CodeBlock({ code, className = '' }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group ${className}`}>
      <pre className="bg-bg-primary border border-bg-elevated rounded-lg px-4 py-3 text-sm font-mono text-text-primary overflow-x-auto">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-bg-elevated border border-border-primary text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

const COMMAND_ICONS: Record<string, typeof Terminal> = {
  setup: Rocket,
  init: Play,
  login: LogIn,
  logout: LogIn,
  whoami: Shield,
  stats: BarChart3,
  sessions: Terminal,
  export: Upload,
  team: Users,
  config: Settings,
  sync: Upload,
};

export default function DocsPage() {
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-purple-900/30 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Documentation</h1>
        </div>
        <p className="text-sm text-text-muted ml-12">
          Getting started guide and CLI command reference for EvaluateAI
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar navigation */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
          {/* Quick start */}
          <div className="bg-bg-card border border-border-primary rounded-lg p-4">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Getting Started</p>
            <div className="space-y-1">
              {['installation', 'setup', 'how-it-works'].map(section => (
                <a
                  key={section}
                  href={`#${section}`}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary py-1.5 px-2 rounded-md hover:bg-bg-elevated transition-colors"
                >
                  <ChevronRight className="w-3 h-3 text-text-muted" />
                  {section === 'installation' ? 'Installation' : section === 'setup' ? 'Initial Setup' : 'How It Works'}
                </a>
              ))}
            </div>
          </div>

          {/* Command list */}
          <div className="bg-bg-card border border-border-primary rounded-lg p-4">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">CLI Commands</p>
            <div className="space-y-0.5">
              {CLI_COMMANDS.map(cmd => {
                const Icon = COMMAND_ICONS[cmd.name] ?? Terminal;
                return (
                  <a
                    key={cmd.name}
                    href={`#cmd-${cmd.name}`}
                    onClick={() => setActiveCommand(cmd.name)}
                    className={`flex items-center gap-2.5 text-sm py-1.5 px-2 rounded-md transition-colors ${
                      activeCommand === cmd.name
                        ? 'bg-purple-900/20 text-purple-400'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <code className="text-xs font-mono">{cmd.name}</code>
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="space-y-8">
          {/* Installation */}
          <section id="installation" className="bg-bg-card border border-border-primary rounded-lg p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <Download className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-text-primary">Installation</h2>
            </div>
            <p className="text-sm text-text-secondary mb-4 leading-relaxed">
              Install the EvaluateAI CLI globally via npm. This gives you the <code className="text-text-primary bg-bg-elevated px-1.5 py-0.5 rounded text-xs font-mono">evalai</code> command.
            </p>
            <CodeBlock code="npm install -g evaluateai" />
            <p className="text-xs text-text-muted mt-3">
              Requires Node.js 20 or later.
            </p>
          </section>

          {/* Initial Setup */}
          <section id="setup" className="bg-bg-card border border-border-primary rounded-lg p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <Rocket className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-text-primary">Initial Setup</h2>
            </div>
            <p className="text-sm text-text-secondary mb-4 leading-relaxed">
              Use the one-command <code className="text-text-primary bg-bg-elevated px-1.5 py-0.5 rounded text-xs font-mono">evalai setup</code> to authenticate and install Claude Code hooks in a single step:
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-text-muted mb-1.5 font-medium">Recommended — one command, browser OAuth</p>
                <CodeBlock code="evalai setup" />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5 font-medium">Zero-browser install (CI/CD, Docker, dashboard one-liner)</p>
                <CodeBlock code="evalai setup --token eai_your_token_here" />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5 font-medium">Verify everything is working</p>
                <CodeBlock code="evalai init --check" />
              </div>
            </div>

            <p className="text-sm text-text-secondary mt-6 mb-3 leading-relaxed">
              Prefer running the steps manually? Use <code className="text-text-primary bg-bg-elevated px-1.5 py-0.5 rounded text-xs font-mono">login</code> + <code className="text-text-primary bg-bg-elevated px-1.5 py-0.5 rounded text-xs font-mono">init</code>:
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-text-muted mb-1.5 font-medium">1. Log in to your account</p>
                <CodeBlock code="evalai login" />
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1.5 font-medium">2. Install Claude Code hooks</p>
                <CodeBlock code="evalai init" />
              </div>
            </div>

            <div className="mt-4 bg-purple-900/10 border border-purple-800/30 rounded-lg p-4 flex items-start gap-3">
              <Lightbulb className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary leading-relaxed">
                After setup, EvaluateAI automatically tracks every Claude Code session. No further configuration needed. View your data on this dashboard or via <code className="text-text-primary bg-bg-elevated px-1 py-0.5 rounded font-mono">evalai stats</code>. Generate a one-liner token in <strong className="text-text-primary">Profile → CLI &amp; API Keys</strong>.
              </p>
            </div>
          </section>

          {/* How it works */}
          <section id="how-it-works" className="bg-bg-card border border-border-primary rounded-lg p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold text-text-primary">How It Works</h2>
            </div>
            <div className="space-y-4 text-sm text-text-secondary leading-relaxed">
              <p>
                EvaluateAI uses Claude Code hooks to automatically capture data about your AI coding sessions:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { title: 'Session Tracking', desc: 'Captures session start/end, model used, tokens consumed, and total cost' },
                  { title: 'Prompt Scoring', desc: 'Evaluates each prompt for specificity, context, clarity, and actionability (0-100)' },
                  { title: 'Anti-Pattern Detection', desc: 'Identifies common prompt mistakes like vague verbs, missing file references, and retries' },
                  { title: 'Improvement Coaching', desc: 'Suggests rewritten prompts and estimates token/cost savings from better prompting' },
                ].map(item => (
                  <div key={item.title} className="bg-bg-primary border border-bg-elevated rounded-lg p-4">
                    <p className="text-xs font-semibold text-text-primary mb-1">{item.title}</p>
                    <p className="text-xs text-text-muted leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                All data is synced to your team dashboard in real-time via Supabase.
              </p>
            </div>
          </section>

          {/* Key metrics explanation */}
          <section className="bg-bg-card border border-border-primary rounded-lg p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-text-primary">Understanding Metrics</h2>
            </div>
            <div className="space-y-3">
              {[
                { metric: 'Prompt Score (0-100)', desc: 'Measures the quality of your prompts. Based on 4 dimensions: Specificity (file paths, function names), Context (error messages, expected behavior), Clarity (concise, single question), and Actionability (clear next steps). Higher is better.' },
                { metric: 'Efficiency Score', desc: 'Session-level metric computed by the LLM scorer. Measures how efficiently you used AI across the entire session, considering retries, token waste, and overall workflow quality.' },
                { metric: 'Anti-Patterns', desc: 'Common prompt mistakes detected automatically. Examples: vague verbs ("fix this"), paraphrased errors (instead of pasting the exact message), too-short prompts, retry loops.' },
                { metric: 'Token Waste Ratio', desc: 'Percentage of tokens that were "wasted" on retries, overly verbose prompts, or repeated context. Lower is better.' },
                { metric: 'Cost per Turn', desc: 'Average API cost for each prompt-response exchange. Helps identify expensive patterns and opportunities to use cheaper models.' },
                { metric: 'Context Peak Usage', desc: 'Maximum percentage of the model context window used in any single turn. High values (>80%) may cause truncation.' },
              ].map(item => (
                <div key={item.metric} className="flex items-start gap-3 bg-bg-primary border border-bg-elevated rounded-lg p-3.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{item.metric}</p>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* CLI Commands Reference */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-cyan-400" />
              CLI Command Reference
            </h2>

            <div className="space-y-4">
              {CLI_COMMANDS.map(cmd => {
                const Icon = COMMAND_ICONS[cmd.name] ?? Terminal;
                return (
                  <section
                    key={cmd.name}
                    id={`cmd-${cmd.name}`}
                    className="bg-bg-card border border-border-primary rounded-lg p-5 hover:border-border-hover transition-colors"
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-7 h-7 rounded-md bg-bg-elevated flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <code className="text-base font-mono font-semibold text-text-primary">evalai {cmd.name}</code>
                    </div>

                    <p className="text-sm text-text-secondary mb-4 leading-relaxed">{cmd.description}</p>

                    {/* Usage */}
                    <div className="mb-4">
                      <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-2">Usage</p>
                      <CodeBlock code={cmd.usage} />
                    </div>

                    {/* Flags */}
                    {cmd.flags && cmd.flags.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-2">Options</p>
                        <div className="space-y-1.5">
                          {cmd.flags.map(f => (
                            <div key={f.flag} className="flex items-start gap-3 text-xs">
                              <code className="text-purple-400 font-mono bg-bg-primary px-2 py-0.5 rounded shrink-0">{f.flag}</code>
                              <span className="text-text-muted">{f.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Examples */}
                    {cmd.examples && cmd.examples.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-2">Examples</p>
                        <div className="space-y-2">
                          {cmd.examples.map((ex, i) => (
                            <CodeBlock key={i} code={ex} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {cmd.notes && (
                      <div className="flex items-start gap-2 mt-3 text-xs text-text-muted">
                        <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400" />
                        <span>{cmd.notes}</span>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
