import React from 'react';
import { Download, FolderOpen, Pause, Play, Trash2, X } from 'lucide-react';
import { useDownloads } from '../context/DownloadContext';
import DownloadCard from '../components/DownloadCard';

const Downloads: React.FC = () => {
    const {
        downloads,
        cancelDownload,
        pauseDownload,
        resumeDownload,
        cancelAllDownloads,
        stopAllDownloads,
        resumeAllDownloads,
        boostDownload,
        clearCompleted,
        retryDownload,
    } = useDownloads();

    const activeDownloads = downloads.filter(d => d.status === 'pending' || d.status === 'downloading' || d.status === 'paused');
    const completedDownloads = downloads.filter(d => d.status === 'completed' || d.status === 'error');
    const stoppableCount = downloads.filter(d => d.status === 'downloading').length;
    const resumableCount = downloads.filter(d => d.status === 'paused').length;

    const handleOpenFolder = async (folderPath?: string) => {
        if (window.electronAPI?.openFolder) {
            await window.electronAPI.openFolder(folderPath);
            return;
        }

        if (window.electronAPI?.openDownloadsFolder) {
            await window.electronAPI.openDownloadsFolder();
        }
    };

    return (
        <div className="page-shell gap-6">
            <div className="surface-card p-6 lg:p-7">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="section-title mb-2">Download Queue</p>
                        <h1 className="text-2xl font-semibold tracking-tight">Downloads</h1>
                        <p className="text-foreground/60 mt-1">
                            Monitor active transfers and completed output in one place.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="stats-chip">{activeDownloads.length} active</span>
                        <span className="stats-chip">{completedDownloads.length} completed</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void handleOpenFolder()}
                        className="btn-ghost"
                    >
                        <FolderOpen className="w-4 h-4" />
                        Open Folder
                    </button>
                    {activeDownloads.length > 0 && (
                        <>
                            <button
                                onClick={() => void stopAllDownloads().catch(console.error)}
                                className="btn-ghost"
                                disabled={stoppableCount === 0}
                                title={stoppableCount === 0 ? 'No running downloads to stop' : 'Stop all running downloads'}
                            >
                                <Pause className="w-4 h-4" />
                                Stop All
                            </button>
                            <button
                                onClick={() => void resumeAllDownloads().catch(console.error)}
                                className="btn-ghost"
                                disabled={resumableCount === 0}
                                title={resumableCount === 0 ? 'No paused downloads to resume' : 'Resume all paused downloads'}
                            >
                                <Play className="w-4 h-4" />
                                Resume All
                            </button>
                            <button
                                onClick={() => void cancelAllDownloads().catch(console.error)}
                                className="btn-danger"
                                title="Cancel all active and paused downloads"
                            >
                                <X className="w-4 h-4" />
                                Cancel All
                            </button>
                        </>
                    )}
                    {completedDownloads.length > 0 && (
                        <button
                            onClick={clearCompleted}
                            className="btn-danger"
                        >
                            <Trash2 className="w-4 h-4" />
                            Clear Completed
                        </button>
                    )}
                </div>
            </div>

            {/* Active Downloads */}
            {activeDownloads.length > 0 && (
                <div className="surface-card p-5 lg:p-6">
                    <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4">
                        Active Downloads
                    </h2>
                    <div className="space-y-3">
                        {activeDownloads.map(item => (
                            <DownloadCard
                                key={item.id}
                                item={item}
                                onCancel={cancelDownload}
                                onPause={pauseDownload}
                                onResume={resumeDownload}
                                onBoost={boostDownload}
                                onOpenFolder={handleOpenFolder}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Downloads */}
            {completedDownloads.length > 0 && (
                <div className="surface-card p-5 lg:p-6">
                    <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4">
                        Completed
                    </h2>
                    <div className="space-y-3">
                        {completedDownloads.map(item => (
                            <DownloadCard
                                key={item.id}
                                item={item}
                                onCancel={cancelDownload}
                                onRetry={retryDownload}
                                onOpenFolder={handleOpenFolder}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {downloads.length === 0 && (
                <div className="surface-card flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="p-4 rounded-full bg-secondary/60 mb-4 border border-foreground/10">
                        <Download className="w-8 h-8 text-foreground/35" />
                    </div>
                    <h3 className="font-medium text-foreground/70 mb-1">No downloads yet</h3>
                    <p className="text-sm text-foreground/45 max-w-xs">
                        Start from Home by pasting a media URL and choosing your preferred format.
                    </p>
                </div>
            )}
        </div>
    );
};

export default Downloads;
