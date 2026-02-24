import React, { useState, useEffect } from 'react';
import { Moon, Sun, Folder, Download, History, Subtitles, Music2, Tag, Globe, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useDownloads } from '../context/DownloadContext';
import { cn } from '../lib/utils';

// Window types are defined in vite-env.d.ts

interface SettingsRowProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    beta?: boolean;
    betaNote?: string;
    children: React.ReactNode;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ icon, title, description, beta = false, betaNote, children }) => (
    <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
        <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-white/5 text-foreground/60">
                {icon}
            </div>
            <div>
                <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{title}</h4>
                    {beta && (
                        <span className="px-1.5 py-0.5 rounded bg-warning/20 text-warning text-[10px] font-semibold uppercase tracking-wide">
                            Beta
                        </span>
                    )}
                </div>
                <p className="text-xs text-foreground/50 mt-0.5">{description}</p>
                {beta && betaNote && (
                    <p className="text-[11px] text-warning/80 mt-1">{betaNote}</p>
                )}
            </div>
        </div>
        <div>{children}</div>
    </div>
);

interface ToggleProps {
    enabled: boolean;
    onToggle: () => void;
}

const Toggle: React.FC<ToggleProps> = ({ enabled, onToggle }) => (
    <button
        onClick={onToggle}
        className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            enabled ? "bg-primary" : "bg-secondary"
        )}
    >
        <div
            className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                enabled ? "left-6" : "left-1"
            )}
        />
    </button>
);

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'tr', name: 'Turkish' },
    { code: 'auto', name: 'Auto-detect' },
    { code: 'original', name: 'Original' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
];

const SettingsPanel: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const { settings, updateSettings, history, clearHistory, getAvailableBrowsers, validateBrowserCookies } = useDownloads();
    const [browsers, setBrowsers] = useState<{ id: string; name: string }[]>([]);
    const [cookieStatus, setCookieStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'unknown'>('idle');
    const [downloadLocation, setDownloadLocation] = useState<{ path: string; defaultPath: string; isDefault: boolean } | null>(null);

    useEffect(() => {
        loadBrowsers();
        loadDownloadLocation();
    }, []);

    const loadBrowsers = async () => {
        const result = await getAvailableBrowsers();
        if (result.success && result.browsers) {
            setBrowsers(result.browsers);
        }
    };

    const loadDownloadLocation = async () => {
        try {
            if (!window.electronAPI?.getDownloadLocation) return;
            const result = await window.electronAPI.getDownloadLocation();
            if (result.success && result.data) {
                setDownloadLocation(result.data);
            }
        } catch {
            // Keep settings usable when location API is unavailable.
        }
    };

    const handleSelectDownloadLocation = async () => {
        if (!window.electronAPI?.selectDownloadLocation) return;
        const result = await window.electronAPI.selectDownloadLocation();
        if (result.success && result.data) {
            setDownloadLocation(result.data);
        }
    };

    const handleResetDownloadLocation = async () => {
        if (!window.electronAPI?.resetDownloadLocation) return;
        const result = await window.electronAPI.resetDownloadLocation();
        if (result.success && result.data) {
            setDownloadLocation(result.data);
        }
    };

    const handleOpenDownloads = async () => {
        if (window.electronAPI?.openDownloadsFolder) {
            await window.electronAPI.openDownloadsFolder();
        }
    };

    const handleToggleHistory = () => {
        if (settings.historyEnabled) {
            const shouldDisable = window.confirm(
                'Disable download history?\n\nFor privacy, existing history will be removed immediately.'
            );

            if (!shouldDisable) {
                return;
            }

            updateSettings({ historyEnabled: false });
            clearHistory();
            return;
        }

        updateSettings({ historyEnabled: true });
    };

    const handleDefaultQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateSettings({ defaultQuality: e.target.value });
    };

    const handleToggleTurboDownload = () => {
        updateSettings({ enableTurboDownload: !settings.enableTurboDownload });
    };

    const handleTurboConnectionsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const parsed = parseInt(e.target.value, 10);
        updateSettings({ turboConnections: Number.isFinite(parsed) ? parsed : 8 });
    };

    const handleToggleSubtitles = () => {
        updateSettings({ embedSubtitles: !settings.embedSubtitles });
    };

    const handleSubtitleLanguagesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const options = e.target.options;
        const selected: string[] = [];
        for (let i = 0; i < options.length; i++) {
            if (options[i].selected) {
                selected.push(options[i].value);
            }
        }
        updateSettings({ subtitleLanguages: selected.length > 0 ? selected : ['en'] });
    };

    const handleToggleMetadata = () => {
        updateSettings({ embedMetadata: !settings.embedMetadata });
    };

    const handleToggleThumbnail = () => {
        updateSettings({ preserveThumbnail: !settings.preserveThumbnail });
    };

    const handleToggleAltAudio = () => {
        updateSettings({ embedAltAudio: !settings.embedAltAudio });
    };

    const handleAudioLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateSettings({ preferredAudioLang: e.target.value });
    };

    const handleBrowserChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const browser = e.target.value;
        updateSettings({ cookiesFromBrowser: browser });

        if (browser) {
            setCookieStatus('checking');
            const result = await validateBrowserCookies(browser);
            if (result.status === 'valid') {
                setCookieStatus('valid');
            } else if (result.status === 'invalid') {
                setCookieStatus('invalid');
            } else {
                setCookieStatus('unknown');
            }
        } else {
            setCookieStatus('idle');
        }
    };

    return (
        <div className="h-full w-full bg-transparent p-8 overflow-auto">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold mb-2">Settings</h1>
                <p className="text-foreground/60 mb-8">Customize your download experience</p>

                {/* Appearance Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        Appearance
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                            title="Dark Mode"
                            description="Toggle between dark and light theme"
                        >
                            <Toggle enabled={theme === 'dark'} onToggle={toggleTheme} />
                        </SettingsRow>
                    </div>
                </div>

                {/* Downloads Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        Downloads
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={<Folder className="w-4 h-4" />}
                            title="Download Location"
                            description={downloadLocation
                                ? `Preferred folder: ${downloadLocation.path}`
                                : 'Choose your preferred default folder'}
                        >
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSelectDownloadLocation}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
                                >
                                    Change
                                </button>
                                {!downloadLocation?.isDefault && (
                                    <button
                                        onClick={handleResetDownloadLocation}
                                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
                                    >
                                        Reset
                                    </button>
                                )}
                                <button
                                    onClick={handleOpenDownloads}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
                                >
                                    Open
                                </button>
                            </div>
                        </SettingsRow>

                        <SettingsRow
                            icon={<Download className="w-4 h-4" />}
                            title="Default Quality"
                            description="Preferred quality for video downloads"
                        >
                            <select
                                value={settings.defaultQuality}
                                onChange={handleDefaultQualityChange}
                                className="px-3 py-1.5 rounded-lg bg-secondary border border-white/10 text-sm focus:outline-none focus:border-primary"
                            >
                                <option value="best">Best Available</option>
                                <option value="2160">4K (2160p)</option>
                                <option value="1440">QHD (1440p)</option>
                                <option value="1080">FHD (1080p)</option>
                                <option value="720">HD (720p)</option>
                                <option value="480">SD (480p)</option>
                            </select>
                        </SettingsRow>

                        <SettingsRow
                            icon={<Download className="w-4 h-4" />}
                            title="Turbo Download"
                            description="Use concurrent fragments and optional aria2c multi-connection mode"
                            beta
                            betaNote="Requires source support. For best speed, install aria2 and keep this enabled."
                        >
                            <Toggle enabled={settings.enableTurboDownload} onToggle={handleToggleTurboDownload} />
                        </SettingsRow>

                        {settings.enableTurboDownload && (
                            <>
                                <SettingsRow
                                    icon={<Download className="w-4 h-4" />}
                                    title="Turbo Mode"
                                    description="Auto adjusts connections based on CPU and active downloads"
                                >
                                    <select
                                        value={settings.adaptiveTurboDownload ? 'auto' : 'manual'}
                                        onChange={(e) => updateSettings({ adaptiveTurboDownload: e.target.value === 'auto' })}
                                        className="px-3 py-1.5 rounded-lg bg-secondary border border-white/10 text-sm focus:outline-none focus:border-primary"
                                    >
                                        <option value="auto">Auto (recommended)</option>
                                        <option value="manual">Manual</option>
                                    </select>
                                </SettingsRow>

                                <div className="px-1 pb-3 text-xs text-foreground/55 leading-relaxed">
                                    Auto is best for most users and prevents aggressive connection spikes during multiple downloads.
                                    Use Manual for stable high-bandwidth networks when you want fixed maximum speed for one download.
                                </div>
                            </>
                        )}

                        {settings.enableTurboDownload && !settings.adaptiveTurboDownload && (
                            <SettingsRow
                                icon={<Download className="w-4 h-4" />}
                                title="Turbo Connections"
                                description="Higher values can improve speed but may increase throttling on some sites"
                            >
                                <select
                                    value={String(settings.turboConnections)}
                                    onChange={handleTurboConnectionsChange}
                                    className="px-3 py-1.5 rounded-lg bg-secondary border border-white/10 text-sm focus:outline-none focus:border-primary"
                                >
                                    <option value="4">4</option>
                                    <option value="8">8</option>
                                    <option value="12">12</option>
                                    <option value="16">16</option>
                                </select>
                            </SettingsRow>
                        )}
                    </div>
                </div>

                {/* Subtitles Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        Subtitles
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={<Subtitles className="w-4 h-4" />}
                            title="Embed Subtitles"
                            description="Automatically embed subtitles in downloaded videos"
                            beta
                            betaNote="May not work for all sources. Subtitle tracks and auto-captions depend on site support."
                        >
                            <Toggle enabled={settings.embedSubtitles} onToggle={handleToggleSubtitles} />
                        </SettingsRow>

                        {settings.embedSubtitles && (
                            <SettingsRow
                                icon={<Globe className="w-4 h-4" />}
                                title="Subtitle Languages"
                                description="Preferred languages for subtitles"
                                beta
                                betaNote="Language availability varies by source. Auto and original language can be inconsistent across sites."
                            >
                                <select
                                    multiple
                                    value={settings.subtitleLanguages}
                                    onChange={handleSubtitleLanguagesChange}
                                    className="px-3 py-1.5 rounded-lg bg-secondary border border-white/10 text-sm focus:outline-none focus:border-primary h-20"
                                    size={3}
                                >
                                    {LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                                    ))}
                                </select>
                            </SettingsRow>
                        )}
                    </div>
                </div>

                {/* Audio Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        Audio
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={<Music2 className="w-4 h-4" />}
                            title="Alternative Audio Tracks"
                            description="Embed additional audio tracks in different languages"
                            beta
                            betaNote="Best effort only. Multi-audio extraction support depends on the source and extractor."
                        >
                            <Toggle enabled={settings.embedAltAudio} onToggle={handleToggleAltAudio} />
                        </SettingsRow>

                        {settings.embedAltAudio && (
                            <SettingsRow
                                icon={<Globe className="w-4 h-4" />}
                                title="Preferred Audio Language"
                                description="Primary audio language preference"
                                beta
                                betaNote="Best effort only. If language-specific streams are unavailable, default audio is used."
                            >
                                <select
                                    value={settings.preferredAudioLang}
                                    onChange={handleAudioLangChange}
                                    className="px-3 py-1.5 rounded-lg bg-secondary border border-white/10 text-sm focus:outline-none focus:border-primary"
                                >
                                    {LANGUAGES.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                                    ))}
                                </select>
                            </SettingsRow>
                        )}
                    </div>
                </div>

                {/* Metadata Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        Metadata
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={<Tag className="w-4 h-4" />}
                            title="Keep Original Thumbnail"
                            description="Best effort: download/embed website thumbnail; Windows Explorer previews may still vary"
                            beta
                            betaNote="Thumbnail embedding depends on media container, ffmpeg availability, and OS preview behavior."
                        >
                            <Toggle enabled={settings.preserveThumbnail} onToggle={handleToggleThumbnail} />
                        </SettingsRow>

                        <SettingsRow
                            icon={<Tag className="w-4 h-4" />}
                            title="Embed Media Tags"
                            description="Include title, artist, thumbnail in downloaded files"
                            beta
                            betaNote="Metadata embedding support varies by source format and container type."
                        >
                            <Toggle enabled={settings.embedMetadata} onToggle={handleToggleMetadata} />
                        </SettingsRow>
                    </div>
                </div>

                {/* Account/Authentication Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        Account
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={<Globe className="w-4 h-4" />}
                            title="Browser Cookies"
                            description="Use cookies from browser for private content access"
                            beta
                            betaNote="Browser integration may fail depending on OS permissions, browser profile state, or site changes."
                        >
                            <div className="flex items-center gap-2">
                                <select
                                    value={settings.cookiesFromBrowser}
                                    onChange={handleBrowserChange}
                                    className="px-3 py-1.5 rounded-lg bg-secondary border border-white/10 text-sm focus:outline-none focus:border-primary"
                                >
                                    <option value="">Don't use cookies</option>
                                    {browsers.map(browser => (
                                        <option key={browser.id} value={browser.id}>{browser.name}</option>
                                    ))}
                                </select>
                                {cookieStatus === 'checking' && (
                                    <Loader2 className="w-4 h-4 animate-spin text-foreground/50" />
                                )}
                                {cookieStatus === 'valid' && (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                )}
                                {cookieStatus === 'invalid' && (
                                    <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                {cookieStatus === 'unknown' && (
                                    <span className="w-2.5 h-2.5 rounded-full bg-warning inline-block" />
                                )}
                            </div>
                        </SettingsRow>
                        {settings.cookiesFromBrowser && cookieStatus === 'valid' && (
                            <div className="mt-2 p-2 bg-green-500/10 rounded-lg text-xs text-green-400">
                                ✓ Connected! You can now download private and age-restricted content.
                            </div>
                        )}
                        {settings.cookiesFromBrowser && cookieStatus === 'invalid' && (
                            <div className="mt-2 p-2 bg-red-500/10 rounded-lg text-xs text-red-400">
                                Could not verify cookies. Make sure you're logged in to YouTube in the selected browser.
                            </div>
                        )}
                        {settings.cookiesFromBrowser && cookieStatus === 'unknown' && (
                            <div className="mt-2 p-2 bg-warning/10 rounded-lg text-xs text-warning">
                                Cookie check was inconclusive. Download may still work, but browser access could be limited.
                            </div>
                        )}
                    </div>
                </div>

                {/* History Section */}
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-foreground/40 uppercase tracking-wider mb-4">
                        History
                    </h2>
                    <div className="bg-secondary/30 rounded-2xl p-4 border border-white/5">
                        <SettingsRow
                            icon={<History className="w-4 h-4" />}
                            title="Enable Download History"
                            description="Keep track of your completed downloads"
                        >
                            <Toggle enabled={settings.historyEnabled} onToggle={handleToggleHistory} />
                        </SettingsRow>

                        {settings.historyEnabled && history.length > 0 && (
                            <SettingsRow
                                icon={<History className="w-4 h-4" />}
                                title="Clear History"
                                description={`${history.length} item${history.length === 1 ? '' : 's'} in history`}
                            >
                                <button
                                    onClick={clearHistory}
                                    className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition-colors"
                                >
                                    Clear All
                                </button>
                            </SettingsRow>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SettingsPanel;

