import React from 'react';
import { ArrowDownToLine } from 'lucide-react';

interface NavbarProps {
  activeTab: 'single' | 'batch' | 'history' | 'guide';
  setActiveTab: (tab: 'single' | 'batch' | 'history' | 'guide') => void;
  onTryDemo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onTryDemo }) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          onClick={() => setActiveTab('single')}
          className="text-left flex items-center gap-2 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg p-1"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 via-pink-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
            <ArrowDownToLine className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 group-hover:text-rose-400 transition-colors">
            TikDownloader
          </span>
        </button>

        {/* Zone 2: Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('single')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'single' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Video Downloader
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'batch' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Batch Queue
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'history' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Saved Library
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'guide' ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            How It Works
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onTryDemo}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm active:scale-95"
          >
            Try Demo Video
          </button>
        </div>
      </div>
    </header>
  );
};
