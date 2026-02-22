import React from 'react';
import { cn } from '../lib/utils';

interface AetherLensLogoProps {
    className?: string;
    compact?: boolean;
}

const AetherLensLogo: React.FC<AetherLensLogoProps> = ({ className, compact = false }) => {
    return (
        <div className={cn('flex items-center gap-3', className)}>
            <div className="h-8 w-8 rounded-lg bg-primary/12 border border-primary/25 flex items-center justify-center shadow-sm">
                <svg
                    viewBox="0 0 64 64"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    role="img"
                    aria-label="AetherLens mark"
                >
                    <circle cx="32" cy="32" r="17" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
                    <circle cx="32" cy="32" r="6" fill="currentColor" className="text-primary" />
                    <path d="M12 44 L24 36 L38 42 L50 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/80" />
                    <circle cx="12" cy="44" r="2.5" fill="currentColor" className="text-accent" />
                    <circle cx="24" cy="36" r="2.5" fill="currentColor" className="text-accent" />
                    <circle cx="38" cy="42" r="2.5" fill="currentColor" className="text-accent" />
                    <circle cx="50" cy="24" r="3" fill="currentColor" className="text-accent" />
                </svg>
            </div>
            {!compact && (
                <div className="leading-tight">
                    <p className="text-sm font-semibold tracking-[0.06em] text-foreground">AetherLens</p>
                    <p className="text-[11px] text-foreground/55">Media Downloader</p>
                </div>
            )}
        </div>
    );
};

export default AetherLensLogo;
