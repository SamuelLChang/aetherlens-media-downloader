import React, { useEffect, useState } from 'react';
import { Minus, X, Maximize2 } from 'lucide-react';
import Sidebar from './Sidebar';
import Home from '../pages/Home';
import Downloads from '../pages/Downloads';
import History from '../pages/History';
import Settings from '../pages/Settings';
import Info from '../pages/Info';
import AetherLensLogo from './AetherLensLogo';
import SetupWizard from './SetupWizard';

// Window types are defined in vite-env.d.ts

const SETUP_COMPLETE_STORAGE_KEY = 'aetherlens-setup-complete-v1';

type Page = 'home' | 'downloads' | 'history' | 'settings' | 'info';

const pageMap: Record<Page, React.ReactNode> = {
    home: <Home />,
    downloads: <Downloads />,
    history: <History />,
    settings: <Settings />,
    info: <Info />,
};

const isPage = (value: string): value is Page => {
    return value in pageMap;
};

const Layout: React.FC = () => {
    const [currentPage, setCurrentPage] = useState<Page>('home');
    const [showSetupWizard, setShowSetupWizard] = useState(false);

    const handleNavigate = (page: string) => {
        if (isPage(page)) {
            setCurrentPage(page);
        }
    };

    useEffect(() => {
        const setupDismissed = localStorage.getItem(SETUP_COMPLETE_STORAGE_KEY);
        if (!setupDismissed) {
            setShowSetupWizard(true);
        }
    }, []);

    const handleSetupClose = () => {
        localStorage.setItem(SETUP_COMPLETE_STORAGE_KEY, 'true');
        setShowSetupWizard(false);
    };

    const handleMinimize = () => {
        if (window.electronAPI?.minimize) {
            window.electronAPI.minimize();
        } else if (window.ipcRenderer?.send) {
            window.ipcRenderer.send('window-minimize');
        } else {
            console.warn('No IPC available for minimize');
        }
    };

    const handleMaximize = () => {
        if (window.electronAPI?.maximize) {
            window.electronAPI.maximize();
        } else if (window.ipcRenderer?.send) {
            window.ipcRenderer.send('window-maximize');
        } else {
            console.warn('No IPC available for maximize');
        }
    };

    const handleClose = () => {
        if (window.electronAPI?.close) {
            window.electronAPI.close();
        } else if (window.ipcRenderer?.send) {
            window.ipcRenderer.send('window-close');
        } else {
            console.warn('No IPC available for close');
        }
    };

    return (
        <div className="flex flex-col h-screen text-foreground overflow-hidden relative">
            <div className="grid-overlay" />

            {/* Custom Titlebar */}
            <header className="h-12 glass-panel flex items-center justify-between px-4 drag-region select-none border-b border-foreground/5 flex-shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <AetherLensLogo />
                </div>
                <div className="flex items-center gap-1 no-drag">
                    <button
                        onClick={handleMinimize}
                        className="p-2 rounded-md hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
                        title="Minimize"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleMaximize}
                        className="p-2 rounded-md hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
                        title="Maximize"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-md hover:bg-error/15 text-foreground/60 hover:text-error transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Main Content Area with Sidebar */}
            <div className="flex flex-1 overflow-hidden z-10">
                <Sidebar
                    currentPage={currentPage}
                    onNavigate={handleNavigate}
                />
                <main className="flex-1 overflow-auto relative bg-background/60 border-l border-foreground/5">
                    {pageMap[currentPage]}
                </main>
            </div>

            <SetupWizard isOpen={showSetupWizard} onClose={handleSetupClose} />
        </div>
    );
};

export default Layout;
