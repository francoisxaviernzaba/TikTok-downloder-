import React from 'react';
import { Download, Trash2, Clock, Film, ExternalLink, Play } from 'lucide-react';
import type { HistoryItem } from '../types';

interface HistoryListProps {
  items: HistoryItem[];
  onClearHistory: () => void;
  onRemoveItem: (id: string) => void;
  onSelectVideoUrl: (url: string) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  onClearHistory,
  onRemoveItem,
  onSelectVideoUrl
}) => {
  if (items.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-8 text-center shadow-xl">
        <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700/80 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-white">No Downloads in History</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
          Videos you extract or download will be saved here in your browser storage so you can easily access them again.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 md:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white">Download History</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Your recently extracted TikTok videos and files ({items.length} items)
          </p>
        </div>
        <button
          onClick={onClearHistory}
          className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="group relative bg-slate-950/80 border border-slate-800/80 rounded-xl overflow-hidden hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div className="relative aspect-[16/9] w-full bg-black overflow-hidden">
              <img
                src={item.cover}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
              
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-white">
                <span className="truncate max-w-[140px] font-medium">@{item.authorHandle}</span>
                <span className="text-[10px] text-slate-300 font-mono">
                  {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>

            <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
              <p className="text-xs text-slate-200 font-medium line-clamp-2 leading-relaxed">
                {item.title || 'Untitled TikTok Video'}
              </p>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                <a
                  href={`/api/download?src=${encodeURIComponent(
                    item.sourceUrl || `https://www.tiktok.com/@${item.authorHandle}/video/${item.id}`
                  )}&kind=video&filename=tiktok_${item.id}_nowm.mp4`}
                  download
                  className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </a>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onSelectVideoUrl(`https://www.tiktok.com/@${item.authorHandle}/video/${item.id}`)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Re-open video"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
