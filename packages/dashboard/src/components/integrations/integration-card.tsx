'use client';

import { Check, Plug, Key, Loader2, RefreshCw, Settings } from 'lucide-react';
import type { IntegrationCardDef } from './types';

interface IntegrationCardProps {
  card: IntegrationCardDef;
  isConnected: boolean;
  loading: boolean;
  syncing: boolean;
  teamId: string;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
  onSync: (id: string) => void;
}

export function IntegrationCard({
  card,
  isConnected,
  loading,
  syncing,
  teamId,
  onConnect,
  onManage,
  onSync,
}: IntegrationCardProps) {
  const Icon = card.icon;
  const isAvailable = card.available;

  return (
    <div
      className={`
        bg-bg-card border border-border-primary rounded-lg p-5
        transition-all duration-200
        ${isAvailable ? 'hover:border-border-hover hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]' : 'opacity-60'}
      `}
    >
      {/* Top: Icon + Status Badge */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            isConnected
              ? 'bg-emerald-900/30 text-emerald-400'
              : isAvailable
              ? 'bg-purple-900/20 text-purple-400'
              : 'bg-bg-elevated text-text-muted'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>

        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/25 border border-emerald-800/40 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Connected
          </span>
        ) : !isAvailable ? (
          <span className="inline-flex items-center rounded-full bg-bg-elevated border border-border-primary px-2.5 py-1 text-[11px] font-medium text-text-muted">
            Coming Soon
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated border border-border-primary px-2.5 py-1 text-[11px] font-medium text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
            Not Connected
          </span>
        )}
      </div>

      {/* Name + Description */}
      <h3 className="text-sm font-semibold text-text-primary mb-1">
        {card.name}
      </h3>
      <p className="text-xs text-text-muted leading-relaxed mb-5">
        {card.description}
      </p>

      {/* Action Buttons */}
      {isConnected && isAvailable ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSync(card.id)}
            disabled={syncing}
            className="flex-1 flex items-center justify-center gap-2 border border-purple-600/40 bg-purple-900/20 hover:bg-purple-900/30 disabled:opacity-50 disabled:cursor-not-allowed text-purple-300 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            onClick={() => onManage(card.id)}
            className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Manage
          </button>
        </div>
      ) : isAvailable ? (
        <button
          onClick={() => onConnect(card.id)}
          disabled={loading || !teamId}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : card.id === 'fireflies' ? (
            <Key className="h-4 w-4" />
          ) : (
            <Plug className="h-4 w-4" />
          )}
          Connect
        </button>
      ) : (
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 bg-bg-elevated text-text-muted rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed"
        >
          Coming Soon
        </button>
      )}
    </div>
  );
}
