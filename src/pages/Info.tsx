import React from 'react';
import { AlertTriangle, FileText, Gavel, ShieldCheck, Target } from 'lucide-react';

const Info: React.FC = () => {
    return (
        <div className="h-full w-full bg-transparent flex flex-col gap-6 p-8 lg:p-10 overflow-auto scroll-smooth">
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
