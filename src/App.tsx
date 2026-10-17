import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Download,
  Clipboard,
  X,
  AlertCircle,
  Loader2,
  Sparkles,
  Music,
  Layers,
  History,
  FileQuestion,
  CheckCircle2
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { VideoResult } from './components/VideoResult';
import { BatchDownloader } from './components/BatchDownloader';
import { HistoryList } from './components/HistoryList';
import { HowToGuide } from './components/HowToGuide';
import type { TikTokVideoData, HistoryItem } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'history' | 'guide'>('single');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<TikTokVideoData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [extractMode, setExtractMode] = useState<'video' | 'audio'>('video');

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tikdown_history_v1');
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveToHistory = (data: TikTokVideoData) => {
    setHistory((prev) => {
      const existing = prev.filter((item) => item.id !== data.id);
      const updated: HistoryItem[] = [
        {
          id: data.id,
          title: data.title,
          authorName: data.author.nickname,
          authorHandle: data.author.unique_id,
          cover: data.cover,
          downloadUrl: data.downloads.nowm,
          timestamp: Date.now(),
          isVideo: data.isVideo
        },
        ...existing
      ].slice(0, 30); // Keep max 30 recent items

      try {
        localStorage.setItem('tikdown_history_v1', JSON.stringify(updated));
      } catch {
        // Storage full or unavailable
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('tikdown_history_v1');
    } catch {
      // Ignore
    }
  };

  const handleRemoveHistoryItem = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('tikdown_history_v1', JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.includes('tiktok.com')) {
        setUrl(text.trim());
        setError(null);
      } else if (text) {
        setUrl(text.trim());
      }
    } catch {
      // Clipboard permission denied or unsupported
    }
  };

  const handleExtract = async (targetUrl?: string) => {
    const linkToTest = (targetUrl || url).trim();
    if (!linkToTest) {
      setError('Please paste a TikTok video link first.');
      return;
    }

    if (!linkToTest.includes('tiktok.com')) {
      setError('Please enter a valid TikTok link containing tiktok.com.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkToTest })
      });

      const json = await response.json();

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to extract video. Please ensure the TikTok link is public.');
      }

      setExtractedData(json.data);
      saveToHistory(json.data);
      setActiveTab('single');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to download video';
      setError(msg);
      setExtractedData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTryDemo = (demoUrl?: string) => {
    const demo = demoUrl || 'https://www.tiktok.com/@therealmrcliff/video/7427804963037777159';
    setUrl(demo);
    setError(null);
    setActiveTab('single');
    handleExtract(demo);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* 3-Zone Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onTryDemo={() => handleTryDemo()}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12 flex flex-col gap-8">
        {/* Navigation Tabs (Functional interactive segmented control) */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium">
            <button
              onClick={() => setActiveTab('single')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'single'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Single Downloader</span>
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'batch'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch Queue</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Saved Library ({history.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'guide'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileQuestion className="w-3.5 h-3.5" />
              <span>How It Works</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Single Downloader */}
        {activeTab === 'single' && (
          <div className="flex flex-col gap-8">
            {/* Hero Card */}
            <div className="text-center flex flex-col items-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white max-w-2xl text-balance">
                Download TikTok Videos Without Watermark
              </h1>
              <p className="mt-3 text-sm md:text-base text-slate-400 max-w-xl text-balance leading-relaxed">
                Save clean HD MP4 videos, original sound MP3s, and photo slideshows with zero watermark overlays.
              </p>

              {/* Main Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleExtract();
                }}
                className="w-full max-w-2xl mt-8"
              >
                <div className="relative flex flex-col sm:flex-row items-stretch bg-slate-900 border border-slate-700/80 focus-within:border-rose-500/80 rounded-2xl p-2 shadow-2xl transition-all gap-2">
                  <div className="relative flex-1 flex items-center pl-3">
                    <LinkIcon className="w-5 h-5 text-slate-500 shrink-0 mr-2.5" />
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Paste TikTok video link (e.g. https://www.tiktok.com/@.../video/...)"
                      className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none py-2 pr-16"
                    />

                    {/* Quick clear & paste buttons inside input */}
                    <div className="absolute right-2 flex items-center gap-1">
                      {url && (
                        <button
                          type="button"
                          onClick={() => {
                            setUrl('');
                            setError(null);
                          }}
                          className="p-1 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
                          title="Clear input"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                        title="Paste from clipboard"
                      >
                        <Clipboard className="w-3 h-3" />
                        <span className="hidden sm:inline">Paste</span>
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="px-6 py-3.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all shrink-0"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Extracting...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Download Video</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Quick Sample Links Strip */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                <span className="text-slate-500">Try trending demo:</span>
                <button
                  onClick={() => handleTryDemo('https://www.tiktok.com/@therealmrcliff/video/7427804963037777159')}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Moo Deng Hippo 🎶
                </button>
                <button
                  onClick={() => handleTryDemo('https://www.tiktok.com/@logagm/video/7404231127738748166')}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Viral Cucumber Recipe 🥒
                </button>
              </div>

              {/* Error Notice */}
              {error && (
                <div className="w-full max-w-2xl mt-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-left text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-rose-200">Unable to download video</p>
                    <p className="mt-0.5 text-rose-300/80 leading-relaxed">{error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Extracted Video Result */}
            {extractedData && (
              <VideoResult
                data={extractedData}
                onSaveToHistory={saveToHistory}
              />
            )}

            {/* Quick feature overview below hero if no result yet */}
            {!extractedData && !loading && (
              <div className="mt-4 pt-8 border-t border-slate-800/80">
                <HowToGuide />
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Batch Downloader */}
        {activeTab === 'batch' && (
          <BatchDownloader
            onSaveToHistory={saveToHistory}
            onPreview={(data) => {
              setExtractedData(data);
              setActiveTab('single');
            }}
          />
        )}

        {/* Tab 3: Saved Library */}
        {activeTab === 'history' && (
          <HistoryList
            items={history}
            onClearHistory={handleClearHistory}
            onRemoveItem={handleRemoveHistoryItem}
            onSelectVideoUrl={(videoUrl) => {
              setUrl(videoUrl);
              setActiveTab('single');
              handleExtract(videoUrl);
            }}
          />
        )}

        {/* Tab 4: How It Works & FAQ */}
        {activeTab === 'guide' && <HowToGuide />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 TikTok Video Downloader. For personal backup and fair-use educational purposes.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>High Definition MP4</span>
            <span aria-hidden="true">·</span>
            <span>Zero Watermarks</span>
            <span aria-hidden="true">·</span>
            <span>MP3 Extraction</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
