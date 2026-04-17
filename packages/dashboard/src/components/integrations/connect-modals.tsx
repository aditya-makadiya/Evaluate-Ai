'use client';

import { X, Check, Unplug, Loader2 } from 'lucide-react';

// ---------- Fireflies Connect Modal ----------

interface FirefliesConnectModalProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  connecting: boolean;
  onConnect: () => void;
  onClose: () => void;
}

export function FirefliesConnectModal({
  apiKey,
  onApiKeyChange,
  connecting,
  onConnect,
  onClose,
}: FirefliesConnectModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border-primary rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Connect Fireflies.ai
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-text-secondary mb-4">
          Enter your Fireflies API key to connect. You can find it at{' '}
          <span className="text-purple-400">
            Fireflies Dashboard &rarr; Integrations &rarr; Fireflies API
          </span>
          . Only workspace admins can access the API key.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Enter your Fireflies API key..."
            className="w-full rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConnect();
            }}
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-border-primary bg-bg-card hover:bg-bg-elevated text-text-secondary rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConnect}
            disabled={connecting || !apiKey.trim()}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {connecting ? 'Verifying...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Disconnect Confirmation Modal ----------

interface DisconnectModalProps {
  providerName: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function DisconnectModal({
  providerName,
  description,
  onConfirm,
  onClose,
}: DisconnectModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-border-primary rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/30">
            <Unplug className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Disconnect {providerName}?
            </h3>
            <p className="text-xs text-text-muted">
              This action can be undone by reconnecting.
            </p>
          </div>
        </div>

        <p className="text-xs text-text-secondary mb-5">{description}</p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-border-primary bg-bg-card hover:bg-bg-elevated text-text-secondary rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Unplug className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
