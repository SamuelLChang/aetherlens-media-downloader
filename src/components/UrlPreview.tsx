import React from 'react';
import { Loader2, Clock, Eye, User, Calendar, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { VideoInfo } from '../context/DownloadContext';

interface UrlPreviewProps {
    videoInfo: VideoInfo | null;
    isLoading: boolean;
    error?: string;
    onDownload: () => void;
}

const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatViewCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
};

const formatUploadDate = (dateStr: string): string => {
    // yt-dlp format: YYYYMMDD
    if (dateStr.length === 8) {
        const year = dateStr.slice(0, 4);
        const month = dateStr.slice(4, 6);
        const day = dateStr.slice(6, 8);
        return `${month}/${day}/${year}`;
    }
    return dateStr;
};

const UrlPreview: React.FC<UrlPreviewProps> = ({ videoInfo, isLoading, error, onDownload }) => {
    if (isLoading) {
        return (
            <div className="bg-card/80 backdrop-blur-sm border border-foreground/8 rounded-2xl p-6 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-foreground/70">Fetching video info...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-error/10 border border-error/25 rounded-2xl p-4 text-center">
                <p className="text-error text-sm">{error}</p>
            </div>
        );
    }

    if (!videoInfo) return null;

    return (
        <div className="bg-card/90 backdrop-blur-sm border border-foreground/8 rounded-2xl overflow-hidden animate-fade-in">
            <div className="flex flex-col sm:flex-row">
                {/* Thumbnail */}
                <div className="relative sm:w-64 aspect-video sm:aspect-auto flex-shrink-0">
                    <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        className="w-full h-full object-cover"
                    />
                    {/* Duration badge */}
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 rounded text-xs font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(videoInfo.duration)}
                    </div>
                    {/* Source badge */}
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/80 rounded text-xs font-medium">
                        {videoInfo.extractor || 'Video'}
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                        <h3 className="font-semibold text-lg line-clamp-2 mb-2">
                            {videoInfo.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/60">
                            <div className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                <span>{videoInfo.uploader}</span>
                            </div>

                            {videoInfo.view_count && (
                                <div className="flex items-center gap-1">
                                    <Eye className="w-4 h-4" />
                                    <span>{formatViewCount(videoInfo.view_count)} views</span>
                                </div>
                            )}

                            {videoInfo.upload_date && (
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    <span>{formatUploadDate(videoInfo.upload_date)}</span>
                                </div>
                            )}
                        </div>

                        {videoInfo.description && (
                            <p className="mt-3 text-sm text-foreground/50 line-clamp-2">
                                {videoInfo.description}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between mt-4">
                        {/* Quality pills */}
                        {videoInfo.videoQualities && videoInfo.videoQualities.length > 0 && (
                            <div className="flex gap-1.5">
                                {videoInfo.videoQualities.slice(0, 4).map((q) => (
                                    <span
                                        key={q}
                                        className={cn(
                                            "px-2 py-0.5 rounded-full text-xs font-medium",
                                            q >= 2160 ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black" :
                                                q >= 1080 ? "bg-primary/80 text-black" :
                                                    "bg-white/10 text-white"
                                        )}
                                    >
                                        {q}p
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            {/* External link */}
                            {videoInfo.webpage_url && (
                                <a
                                    href={videoInfo.webpage_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            )}

                            <button
                                onClick={onDownload}
                                className="px-4 py-2 bg-primary text-black rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                            >
                                Download
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UrlPreview;
