import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Gavel, ShieldCheck, Target, ArrowUpCircle, Monitor, RefreshCw, Loader2 } from 'lucide-react';

const Info: React.FC = () => {
    const [appVersion, setAppVersion] = useState('0.0.0');
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [updateError, setUpdateError] = useState('');
    const [updateInfo, setUpdateInfo] = useState<{
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
        releaseUrl: string;
        publishedAt: string | null;
    } | null>(null);

    useEffect(() => {
        loadAppInfo();
        checkForUpdates(false);
    }, []);

    const loadAppInfo = async () => {
        try {
            if (!window.electronAPI?.getAppInfo) return;
            const result = await window.electronAPI.getAppInfo();
            if (result?.success && result.data?.version) {
                setAppVersion(result.data.version);
            }
        } catch {
            // Keep fallback version text when app info is unavailable.
        }
    };

    const checkForUpdates = async (_manual = true) => {
        if (!window.electronAPI?.checkForUpdates) {
            setUpdateError('Update check is unavailable in this build.');
            return;
        }

        setIsCheckingUpdates(true);
        setUpdateError('');

        try {
            const result = await window.electronAPI.checkForUpdates();
            if (result.success && result.data) {
                setUpdateInfo(result.data);
            } else {
                setUpdateInfo(null);
                setUpdateError(result.error || 'Unable to check for updates.');
            }
        } catch {
            setUpdateInfo(null);
            setUpdateError('Unable to check for updates.');
        } finally {
            setIsCheckingUpdates(false);
        }
    };

    const handleOpenUpdatePage = async () => {
        if (!updateInfo?.releaseUrl) return;

        if (window.electronAPI?.openExternalUrl) {
            await window.electronAPI.openExternalUrl(updateInfo.releaseUrl);
            return;
        }

        window.open(updateInfo.releaseUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="h-full w-full bg-transparent flex flex-col gap-6 p-8 lg:p-10 overflow-auto scroll-smooth">
            <section className="panel p-6 lg:p-7">
                <div className="flex items-start gap-3">
                    <ArrowUpCircle className="w-5 h-5 text-primary mt-0.5" />
                    <div className="w-full">
                        <p className="section-title">App & Updates</p>
                        <div className="mt-3 p-4 rounded-xl border border-white/10 bg-secondary/20">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-sm text-foreground/70">
                                    <Monitor className="w-4 h-4" />
                                    <span>Version {appVersion} • Built with Electron + React</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {updateInfo?.updateAvailable && (
                                        <button
                                            onClick={handleOpenUpdatePage}
                                            className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-sm transition-colors"
                                        >
                                            Update
                                        </button>
                                    )}
                                    <button
                                        onClick={() => checkForUpdates(true)}
                                        disabled={isCheckingUpdates}
                                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-60 text-sm transition-colors inline-flex items-center gap-1.5"
                                    >
                                        {isCheckingUpdates ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        )}
                                        Check now
                                    </button>
                                </div>
                            </div>

                            <p className="text-sm text-foreground/70 mt-3">
                                {updateInfo
                                    ? updateInfo.updateAvailable
                                        ? `Update available: v${updateInfo.latestVersion} (current v${updateInfo.currentVersion})`
                                        : `You're up to date on v${updateInfo.currentVersion}`
                                    : updateError || 'Checking for latest release...'}
                            </p>

                            {updateInfo?.updateAvailable && (
                                <div className="mt-3 p-2 bg-primary/10 rounded-lg text-xs text-primary">
                                    A new version is available. Click Update to open the download page and install the latest version.
                                </div>
                            )}
                            {!updateInfo?.updateAvailable && updateInfo && (
                                <div className="mt-3 p-2 bg-green-500/10 rounded-lg text-xs text-green-400">
                                    You're on the latest available release.
                                </div>
                            )}
                            {updateError && (
                                <div className="mt-3 p-2 bg-red-500/10 rounded-lg text-xs text-red-400">
                                    {updateError}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className="panel p-6 lg:p-7">
                <div className="flex items-start gap-3">
                    <Target className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                        <p className="section-title">Program Purpose</p>
                        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground mt-1">
                            AetherLens Media Downloader
                        </h1>
                        <p className="text-foreground/70 text-sm leading-relaxed mt-3 max-w-3xl">
                            AetherLens is built to help users save media they are authorized to keep, organize, and access offline.
                            The app focuses on a reliable desktop workflow for metadata preview, quality selection, playlist handling,
                            and resumable downloads.
                        </p>
                    </div>
                </div>
            </section>

            <section className="panel p-6 lg:p-7">
                <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-accent mt-0.5" />
                    <div>
                        <p className="section-title">Development Aim</p>
                        <ul className="text-sm text-foreground/70 leading-relaxed mt-2 space-y-2 list-disc pl-5">
                            <li>Provide a clear and fast user experience for legitimate personal downloads.</li>
                            <li>Keep the desktop client stable across common video and playlist sources.</li>
                            <li>Expose practical controls: pause, resume, retry, format choice, and quality preference.</li>
                            <li>Improve transparency by showing metadata before users start a download.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="panel p-6 lg:p-7 border border-warning/25">
                <div className="flex items-start gap-3">
                    <Gavel className="w-5 h-5 text-warning mt-0.5" />
                    <div>
                        <p className="section-title">Legal Responsibility</p>
                        <p className="text-sm text-foreground/75 leading-relaxed mt-2">
                            Users are responsible for complying with copyright law, local regulations, and each platform's terms of service.
                            This software is not intended to bypass DRM, paywalls, or access controls.
                        </p>
                        <p className="text-sm text-foreground/75 leading-relaxed mt-2">
                            If you do not own the content or have explicit permission/license to download it, do not download it.
                        </p>
                    </div>
                </div>
            </section>

            <section className="panel p-6 lg:p-7">
                <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-success mt-0.5" />
                    <div>
                        <p className="section-title">Security Notes</p>
                        <ul className="text-sm text-foreground/70 leading-relaxed mt-2 space-y-2 list-disc pl-5">
                            <li>The project should never ship with embedded API keys or private credentials.</li>
                            <li>Browser cookie usage is optional and only for user-controlled authenticated access.</li>
                            <li>Before publishing, always re-scan for secrets and keep build artifacts out of git.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="panel p-4 lg:p-5 border border-error/25 bg-error/5">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-error mt-0.5" />
                    <p className="text-sm text-foreground/80 leading-relaxed">
                        This page is informational and not legal advice. For commercial or high-risk usage, consult a qualified legal professional.
                    </p>
                </div>
            </section>
        </div>
    );
};

export default Info;
