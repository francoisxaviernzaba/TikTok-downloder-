import React, { useState } from 'react';
import {
  ListPlus,
  Play,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  ExternalLink
} from 'lucide-react';
import type { TikTokVideoData } from '../types';

interface BatchItem {
  id: string;
  url: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: TikTokVideoData;
  error?: string;
}

interface BatchDownloaderProps {
  onSaveToHistory: (data: TikTokVideoData) => void;
  onPreview: (data: TikTokVideoData) => void;
}

export const BatchDownloader: React.FC<BatchDownloaderProps> = ({ onSaveToHistory, onPreview }) => {
  const [inputText, setInputText] = useState('');
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddLinks = () => {
    if (!inputText.trim()) return;

    const urls = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes('tiktok.com'));

    if (urls.length === 0) return;

    const newItems: BatchItem[] = urls.map((url, i) => ({
      id: `${Date.now()}-${i}`,
      url,
      status: 'idle'
    }));

    setQueue((prev) => [...prev, ...newItems]);
    setInputText('');
  };

  const processQueue = async () => {
    if (isProcessing || queue.length === 0) return;
    setIsProcessing(true);

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === 'success') continue;

      setQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'loading', error: undefined } : it))
      );

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url })
        });
        const json = await res.json();

        if (json.success && json.data) {
          const videoData: TikTokVideoData = json.data;
          setQueue((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, status: 'success', data: videoData } : it))
          );
          onSaveToHistory(videoData);
        } else {
          setQueue((prev) =>
            prev.map((it) =>
              it.id === item.id ? { ...it, status: 'error', error: json.error || 'Extraction failed' } : it
            )
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network failure';
        setQueue((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'error', error: msg } : it))
        );
      }
    }

    setIsProcessing(false);
  };

  const clearQueue = () => {
    setQueue([]);
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const successCount = queue.filter((i) => i.status === 'success').length;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 md:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white">Batch TikTok Downloader</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Paste multiple TikTok URLs (one per line) to parse and save them together without watermarks.
          </p>
        </div>
        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            disabled={isProcessing}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear List</span>
          </button>
        )}
      </div>

      {/* Input Textarea */}
      <div className="flex flex-col gap-3">
        <textarea
          rows={3}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="https://www.tiktok.com/@user/video/123456789&#10;https://www.tiktok.com/@user/video/987654321&#10;https://vm.tiktok.com/..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleAddLinks}
            disabled={!inputText.trim()}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl text-xs font-medium flex items-center gap-2 border border-slate-700 cursor-pointer disabled:opacity-40 transition-colors"
          >
            <ListPlus className="w-4 h-4 text-rose-400" />
            <span>Add to Batch Queue</span>
          </button>

          {queue.length > 0 && (
            <button
              onClick={processQueue}
              disabled={isProcessing}
              className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-rose-500/20 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Queue...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Parse All ({queue.length} videos)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Queue items */}
      {queue.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono tabular-nums">
            <span>
              Queue Items ({successCount} of {queue.length} ready)
            </span>
          </div>

          <div className="flex flex-col gap-2.5 max-h-96 overflow-y-auto pr-1">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status Indicator */}
                  {item.status === 'idle' && (
                    <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                  )}
                  {item.status === 'loading' && (
                    <Loader2 className="w-4 h-4 text-rose-400 animate-spin shrink-0" />
                  )}
                  {item.status === 'success' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  {item.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}

                  {/* Thumbnail if loaded */}
                  {item.data?.cover && (
                    <img
                      src={item.data.cover}
                      alt="Thumbnail"
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-cover bg-slate-900 border border-slate-800 shrink-0"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-200 truncate">
                      {item.data ? item.data.title || `@${item.data.author.unique_id}` : item.url}
                    </p>
                    {item.error ? (
                      <p className="text-[11px] text-rose-400 truncate">{item.error}</p>
                    ) : item.data ? (
                      <p className="text-[11px] text-slate-400 truncate">
                        By {item.data.author.nickname} ·{' '}
                        {item.data.isVideo ? 'MP4 Video' : 'Photo Slides'}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 font-mono truncate">{item.url}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.data && (
                    <>
                      <button
                        onClick={() => onPreview(item.data!)}
                        className="px-2.5 py-1.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                      <a
                        href={`/api/download?url=${encodeURIComponent(
                          item.data.downloads.nowm
                        )}&filename=tiktok_${item.data.id}_nowm.mp4`}
                        download
                        className="px-2.5 py-1.5 text-[11px] bg-rose-500 hover:bg-rose-600 text-white font-medium rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Save MP4</span>
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
