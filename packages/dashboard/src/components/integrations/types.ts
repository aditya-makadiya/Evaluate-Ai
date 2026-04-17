import type { LucideIcon } from 'lucide-react';

export interface Repo {
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
}

export interface Integration {
  id: string;
  provider: string;
  status: string;
  config: {
    repos?: Array<{
      name: string;
      full_name: string;
      default_branch: string;
      language: string | null;
    }>;
    connected_at?: string;
    tracked_repos?: string[];
    oauth_user?: string;
  };
  lastSyncAt: string | null;
}

export interface DiscoverRepo {
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  updatedAt: string;
  ownerLogin: string;
  ownerType: string;
  tracked: boolean;
}

export interface RepoGroup {
  label: string;
  repos: DiscoverRepo[];
}

export interface IntegrationCardDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
  category: 'code' | 'meetings';
}

export const languageColors: Record<string, string> = {
  TypeScript: 'bg-blue-400',
  JavaScript: 'bg-yellow-400',
  Python: 'bg-green-400',
  Rust: 'bg-orange-400',
  Go: 'bg-cyan-400',
  Java: 'bg-red-400',
  Ruby: 'bg-red-500',
  PHP: 'bg-purple-400',
  'C#': 'bg-green-500',
  'C++': 'bg-pink-400',
  Swift: 'bg-orange-500',
  Kotlin: 'bg-purple-500',
};
