import React, { useState } from 'react';
import { Copy, ArrowRight, Download, CheckCircle2, ChevronDown, HelpCircle, Shield, Zap, Sparkles } from 'lucide-react';

const FAQS = [
  {
    q: 'How does this app remove the TikTok watermark?',
    a: 'TikTok stores multiple streams on its Content Delivery Network (CDN), including the pristine original master video without the animated username watermark overlay. When you paste the link, our backend directly queries the unwatermarked stream URL and delivers the original MP4 file directly to you.'
  },
  {
    q: 'Do I need to install any app or extension?',
    a: 'No! Everything works directly in your web browser on desktop, iPhone (iOS Safari), and Android. Videos download straight to your default Downloads folder.'
  },
  {
    q: 'Can I download TikTok photo slideshows or MP3 audio?',
    a: 'Yes. If a creator posts a photo carousel, you can view and download all HD images individually or the entire gallery. You can also extract the original sound/music as a standalone MP3 audio track.'
  },
  {
    q: 'Is this service free and private?',
    a: 'Yes, 100% free with unlimited downloads. We do not store your download logs, private user accounts, or track personal information.'
  }
];

export const HowToGuide: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-10">
      {/* 3-Step Guide */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl">
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            How to Download TikTok Videos Without Watermark
          </h2>
          <p className="text-xs md:text-sm text-slate-400 mt-1.5">
            Follow these 3 simple steps to save any public TikTok video directly to your phone or computer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-sm mb-3">
              1
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">Copy Video Link</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open TikTok on your app or browser, tap the <strong>Share</strong> button on the video, and select <strong>Copy Link</strong>.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center font-bold text-sm mb-3">
              2
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">Paste into Downloader</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Paste the link into the URL input box at the top of this page, then click <strong>Download Video</strong>.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm mb-3">
              3
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5">Save No-Watermark MP4</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Preview the video right inside the app, then click the download button to save the clean MP4 file or MP3 audio.
            </p>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
            <Sparkles className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Original Quality & Ultra HD</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Maintains full source bitrate and crystal-clear vertical resolution without compression artifacts.
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
            <Zap className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Instant Media Streaming</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Backend proxy streams media directly to your device with authentic filename headers and no ads.
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
            <Shield className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Zero Watermark / Clean Master</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Completely strips away the TikTok bouncing logo and end screen clip so you get clean content for repurposing.
          </p>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-rose-400" />
          <span>Frequently Asked Questions</span>
        </h3>

        <div className="flex flex-col gap-3">
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 text-left flex items-center justify-between gap-4 text-xs md:text-sm font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    openFaq === idx ? 'rotate-180 text-rose-400' : ''
                  }`}
                />
              </button>
              {openFaq === idx && (
                <div className="px-4 pb-4 pt-1 text-xs text-slate-400 leading-relaxed border-t border-slate-800/40">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
