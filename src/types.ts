export interface TikTokAuthor {
  id: string;
  unique_id: string;
  nickname: string;
  avatar: string;
}

export interface TikTokStats {
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  downloads: number;
}

export interface TikTokMusic {
  id: string;
  title: string;
  author: string;
  url: string;
}

export interface TikTokDownloads {
  nowm: string;
  nowm_hd: string;
  watermark: string;
  music: string;
}

export interface TikTokVideoData {
  id: string;
  title: string;
  cover: string;
  duration: number;
  author: TikTokAuthor;
  stats: TikTokStats;
  music: TikTokMusic;
  downloads: TikTokDownloads;
  images: string[];
  isVideo: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  authorName: string;
  authorHandle: string;
  cover: string;
  downloadUrl: string;
  timestamp: number;
  isVideo: boolean;
}

export interface BatchItem {
  id: string;
  url: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: TikTokVideoData;
  error?: string;
}
