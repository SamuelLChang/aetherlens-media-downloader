import React from 'react';
import { Search, Calendar, Download, Trash2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDownloads, HistoryItem } from '../context/DownloadContext';

const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const History: React.FC = () => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const { history, removeFromHistory, clearHistory, addDownload, settings } = useDownloads();

    const filteredHistory = history.filter(item =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleRedownload = async (item: HistoryItem) => {
        await addDownload(item.url, item.format, item.quality);
    };

    if (!settings.historyEnabled) {
        return (
            <div className="page-shell gap-6">
                <div className="surface-card p-6 lg:p-7">
                    <p className="section-title mb-2">Archive</p>
                    <h1 className="text-2xl font-semibold tracking-tight mb-1">Download History</h1>
                    <p className="text-foreground/60">Previously downloaded media and quick re-download shortcuts.</p>
                </div>

                <div className="surface-card flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="p-4 rounded-full bg-secondary/60 border border-foreground/10 mb-4">
                        <XCircle className="w-8 h-8 text-foreground/30" />
                    </div>
                    <h3 className="font-medium text-foreground/70 mb-1">History is disabled</h3>
                    <p className="text-sm text-foreground/45 max-w-xs">
                        Enable history in Settings to track your downloads.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-shell gap-6">
            <div className="surface-card p-6 lg:p-7">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <p className="section-title mb-2">Archive</p>
                        <h1 className="text-2xl font-semibold tracking-tight mb-1">Download History</h1>
                        <p className="text-foreground/60">
                            {history.length} {history.length === 1 ? 'download' : 'downloads'} saved
                        </p>
                    </div>

                    {history.length > 0 && (
                        <button
                            onClick={clearHistory}
                            className="btn-danger"
                        >
                            <Trash2 className="w-4 h-4" />
                            Clear All
                        </button>
                    )}
                </div>

                {/* Search Bar */}
                {history.length > 0 && (
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search history..."
                            className="soft-input pl-10 pr-4 py-2.5"
                        />
                    </div>
                )}
            </div>

            {/* History List */}
            {history.length === 0 ? (
                <div className="surface-card flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="p-4 rounded-full bg-secondary/60 border border-foreground/10 mb-4">
                        <Calendar className="w-8 h-8 text-foreground/30" />
                    </div>
                    <h3 className="font-medium text-foreground/70 mb-1">No history yet</h3>
                    <p className="text-sm text-foreground/45 max-w-xs">
                        Completed downloads will appear here. Start downloading to build your history!
                    </p>
                </div>
            ) : filteredHistory.length === 0 && searchQuery ? (
                <div className="surface-card flex-1 flex flex-col items-center justify-center text-center p-8">
                    <p className="text-sm text-foreground/50">No results matching "{searchQuery}"</p>
                </div>
            ) : (
                <div className="surface-card flex-1 overflow-auto p-4 space-y-3">
                    {filteredHistory.map((item) => (
                        <div
                            key={item.id}
                            className="group list-card flex items-center gap-4"
                        >
                            {/* Thumbnail */}
                            <div className="w-16 h-12 rounded-lg overflow-hidden bg-secondary/70 border border-foreground/10 flex-shrink-0">
                                {item.thumbnail ? (
                                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Download className="w-6 h-6 text-foreground/30" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate">{item.title}</h4>
                                <div className="flex items-center gap-2 mt-1 text-xs text-foreground/50">
                                    <span className={cn(
                                        "px-1.5 py-0.5 rounded",
                                        item.format === 'audio' ? "bg-purple-500/20 text-purple-400" :
                                            item.format === 'photo' ? "bg-pink-500/20 text-pink-400" :
                                                "bg-primary/20 text-primary"
                                    )}>
                                        {item.format === 'audio' ? 'MP3' : item.format === 'photo' ? 'Photo' : item.quality ? `${item.quality}p` : 'Video'}
                                    </span>
                                    <span>•</span>
                                    <span>{formatDate(item.completedAt)}</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleRedownload(item)}
                                    className="p-2 rounded-lg hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
                                    title="Download again"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => removeFromHistory(item.id)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 text-foreground/60 hover:text-red-400 transition-colors"
                                    title="Remove from history"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default History;
