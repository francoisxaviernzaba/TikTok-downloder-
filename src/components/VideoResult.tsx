import React, { useState } from 'react';
import {
  Download,
  Music,
  Image as ImageIcon,
  Check,
  Copy,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  Eye,
  Film,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { TikTokVideoData } from '../types';

interface VideoResultProps {
  data: TikTokVideoData;
  onSaveToHistory: (data: TikTokVideoData) => void;
}

export const VideoResult: React.FC<VideoResultProps> = ({ data, onSaveToHistory }) => {
  const [activeQuality, setActiveQuality] = useState<'sd' | 'hd'>('sd');
  const [copiedLink, setCopiedLink] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const formatNumber = (num: number): string => {
    if (!num) return '0';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const getDownloadUrl = (kind: 'video' | 'hd' | 'music' | 'cover' | 'image', index: number = 0, filename?: string): string => {
    const src = data.sourceUrl || `https://www.tiktok.com/@${data.author.unique_id}/video/${data.id}`;
    const params = new URLSearchParams({ src, kind });
    if (kind === 'image') params.set('index', String(index));
    if (filename) params.set('filename', filename);
    return `/api/download?${params.toString()}`;
  };

  const handleCopyLink = () => {
    const kind = activeQuality === 'hd' ? 'hd' : 'video';
    const url = getDownloadUrl(kind as 'video' | 'hd', 0);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const currentVideoSrc = activeQuality === 'hd' && data.downloads.nowm_hd
    ? getDownloadUrl('hd', 0, undefined) + '&inline=true'
    : getDownloadUrl('video', 0, undefined) + '&inline=true';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 md:p-7 shadow-xl backdrop-blur-sm">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Media Preview Column */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-sm relative rounded-xl overflow-hidden bg-black border border-slate-800 shadow-2xl aspect-[9/16] flex items-center justify-center">
            {data.isVideo ? (
              <video
                key={currentVideoSrc}
                src={currentVideoSrc}
                poster={data.cover}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="relative w-full h-full">
                {data.images.length > 0 ? (
                  <img
                    src={data.images[currentSlideIndex]}
                    alt={`Slide ${currentSlideIndex + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={data.cover}
                    alt={data.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                )}

                {/* Slideshow controls */}
                {data.images.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : data.images.length - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white p-2 rounded-full backdrop-blur-md cursor-pointer transition-colors"
                      aria-label="Previous slide"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setCurrentSlideIndex((prev) => (prev < data.images.length - 1 ? prev + 1 : 0))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white p-2 rounded-full backdrop-blur-md cursor-pointer transition-colors"
                      aria-label="Next slide"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full text-xs font-mono tabular-nums text-white backdrop-blur-md">
                      {currentSlideIndex + 1} / {data.images.length}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Quality switcher badge */}
            {data.isVideo && (
              <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>No Watermark</span>
              </div>
            )}
          </div>

          {/* Quality Mode Selector */}
          {data.isVideo && data.downloads.nowm_hd && data.downloads.nowm_hd !== data.downloads.nowm && (
            <div className="mt-3 flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveQuality('sd')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                  activeQuality === 'sd'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Fast MP4
              </button>
              <button
                onClick={() => setActiveQuality('hd')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  activeQuality === 'hd'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                Ultra HD MP4
              </button>
            </div>
          )}
        </div>

        {/* Video Information & Download Actions Column */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Creator Profile */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-slate-800">
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
              {data.author.avatar ? (
                <img
                  src={data.author.avatar}
                  alt={data.author.nickname}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">
                  {data.author.nickname?.charAt(0) || 'T'}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white truncate text-base">
                {data.author.nickname}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                @{data.author.unique_id}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60 shrink-0">
              ID: {data.id}
            </span>
          </div>

          {/* Video Title / Caption */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
              Caption
            </h4>
            <p className="text-sm text-slate-200 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap select-text">
              {data.title || 'No description provided by creator.'}
            </p>
          </div>

          {/* Social Stats Row */}
          <div className="grid grid-cols-4 gap-2 py-3 px-4 bg-slate-950/70 rounded-xl border border-slate-800/80">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <Eye className="w-3.5 h-3.5" />
                <span>Views</span>
              </div>
              <span className="text-sm font-semibold text-white font-mono tabular-nums">
                {formatNumber(data.stats.plays)}
              </span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <Heart className="w-3.5 h-3.5 text-rose-400" />
                <span>Likes</span>
              </div>
              <span className="text-sm font-semibold text-white font-mono tabular-nums">
                {formatNumber(data.stats.likes)}
              </span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>Comments</span>
              </div>
              <span className="text-sm font-semibold text-white font-mono tabular-nums">
                {formatNumber(data.stats.comments)}
              </span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Shares</span>
              </div>
              <span className="text-sm font-semibold text-white font-mono tabular-nums">
                {formatNumber(data.stats.shares)}
              </span>
            </div>
          </div>

          {/* Audio Information Card */}
          {data.music && (
            <div className="flex items-center gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200 truncate">
                  {data.music.title}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {data.music.author || 'Original Soundtrack'}
                </p>
              </div>
              {data.downloads.music && (
                <a
                  href={getDownloadUrl('music', 0, `tiktok_${data.id}_audio.mp3`)}
                  download
                  onClick={() => onSaveToHistory(data)}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-lg transition-colors flex items-center gap-1 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  MP3
                </a>
              )}
            </div>
          )}

          {/* Action Download Buttons Grid */}
          <div className="flex flex-col gap-2.5 pt-2">
            {data.isVideo ? (
              <>
                {/* Primary: Standard No-Watermark MP4 */}
                <a
                  href={getDownloadUrl('video', 0, `tiktok_${data.id}_nowatermark.mp4`)}
                  download
                  onClick={() => onSaveToHistory(data)}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Video (No Watermark MP4)</span>
                </a>

                {/* Secondary: HD No-Watermark MP4 if available */}
                {data.downloads.nowm_hd && (
                  <a
                    href={getDownloadUrl('hd', 0, `tiktok_${data.id}_hd_nowatermark.mp4`)}
                    download
                    onClick={() => onSaveToHistory(data)}
                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Download Ultra HD (No Watermark)</span>
                  </a>
                )}
              </>
            ) : (
              /* Photo Slideshow Download Actions */
              <div className="flex flex-col gap-2">
                <a
                  href={getDownloadUrl('image', currentSlideIndex, `tiktok_${data.id}_slide_${currentSlideIndex + 1}.jpg`)}
                  download
                  onClick={() => onSaveToHistory(data)}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Current Slide ({currentSlideIndex + 1} of {data.images.length})</span>
                </a>
              </div>
            )}

            {/* Tertiary Action Strip */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              {data.cover && (
                <a
                  href={getDownloadUrl('cover', 0, `tiktok_${data.id}_cover.jpg`)}
                  download
                  className="py-2.5 px-3 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Download Cover</span>
                </a>
              )}

              <button
                onClick={handleCopyLink}
                className="py-2.5 px-3 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied Direct URL!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Direct Stream</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
