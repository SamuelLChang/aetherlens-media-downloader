import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Copy, ExternalLink, ShieldCheck } from 'lucide-react';

type PlatformId = 'windows' | 'macos' | 'linux';

interface RuntimeDependency {
  id: string;
  name: string;
  required: boolean;
  installed: boolean;
  installCommand: string;
  helpUrl: string;
}

interface RuntimeStatus {
  platform: PlatformId;
  dependencies: RuntimeDependency[];
}

const System: React.FC = () => {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [error, setError] = useState('');

  const loadStatus = async () => {
    if (!window.electronAPI?.getRuntimeDependenciesStatus) {
      setError('Runtime dependency check is unavailable in this build.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.getRuntimeDependenciesStatus();
      if (result.success && result.data) {
        setStatus(result.data);
      } else {
        setError('Could not load dependency status.');
      }
    } catch {
      setError('Could not load dependency status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const missingRequired = useMemo(
    () => (status?.dependencies || []).filter((item) => item.required && !item.installed),
    [status],
  );

  const copyCommand = async (id: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1200);
    } catch {
      setCopiedId('');
    }
  };

  const openLink = async (url: string) => {
    if (window.electronAPI?.openExternalUrl) {
      const result = await window.electronAPI.openExternalUrl(url);
      if (!result.success) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="h-full w-full bg-transparent p-8 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            System Check
          </div>
          <h1 className="text-2xl font-bold mt-3">Runtime Dependencies</h1>
          <p className="text-foreground/60 mt-2">
            Check whether required tools are installed and copy one-line install commands when something is missing.
          </p>
        </div>

        <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground/60">
              Platform: <span className="text-foreground/85 font-medium">{status?.platform || 'unknown'}</span>
            </p>
            <button
              onClick={loadStatus}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors inline-flex items-center gap-1.5"
              disabled={isLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Recheck
            </button>
          </div>

          {missingRequired.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
              Some required dependencies are missing. Downloads may fail until they are installed.
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {(status?.dependencies || []).map((item) => (
              <div key={item.id} className="surface-subtle p-4 border border-white/10 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {item.installed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-warning" />
                      )}
                      <p className="text-sm font-medium">
                        {item.name}
                        {item.required ? (
                          <span className="text-warning"> (required)</span>
                        ) : (
                          <span className="text-foreground/50"> (optional)</span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-foreground/60 mt-1">
                      {item.installed ? 'Detected and ready.' : 'Not found on PATH.'}
                    </p>
                  </div>

                  <button
                    onClick={() => openLink(item.helpUrl)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Guide
                  </button>
                </div>

                {!item.installed && (
                  <>
                    <pre className="mt-3 bg-background/60 border border-foreground/10 rounded-lg p-3 text-xs whitespace-pre-wrap break-words">
{item.installCommand}
                    </pre>
                    <button
                      onClick={() => copyCommand(item.id, item.installCommand)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedId === item.id ? 'Copied' : 'Copy command'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default System;
