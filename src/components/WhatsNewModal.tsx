import React from 'react';
import { Sparkles, X } from 'lucide-react';

interface WhatsNewModalProps {
  isOpen: boolean;
  version: string;
  onClose: () => void;
}

const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, version, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl panel p-6 lg:p-7 border border-foreground/15 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-title">What&apos;s New</p>
            <h2 className="text-xl lg:text-2xl font-semibold mt-2">
              Welcome to v{version || 'latest'}
            </h2>
            <p className="text-sm text-foreground/70 mt-2 max-w-xl">
              This update focuses on first-run clarity, better recovery after failures, and easier update visibility.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div className="surface-subtle p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              Better first-run setup flow
            </div>
            <p className="text-xs text-foreground/65 mt-1">
              Required dependency checks are clearer, and limited mode now requires explicit confirmation.
            </p>
          </div>

          <div className="surface-subtle p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              Faster self-recovery on failed downloads
            </div>
            <p className="text-xs text-foreground/65 mt-1">
              Failed jobs now expose Retry, Copy Details, and dependency-specific install guide actions.
            </p>
          </div>

          <div className="surface-subtle p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              Update badge in navigation
            </div>
            <p className="text-xs text-foreground/65 mt-1">
              When a newer release exists, the Info section now shows a visible badge in the sidebar.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn-primary px-4 py-2 rounded-lg">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;