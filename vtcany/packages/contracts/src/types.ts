// Bước 1/8 — TypeScript types dùng chung BE-FE (khởi đầu: Category, Video, Movie).
// Mở rộng dần ở các bước 2-8 theo contract Mục 3 tài liệu v2.

export type Platform = 'WEB' | 'MOBILE' | 'TV';
export type AppliesTo = 'phim' | 'video' | 'short' | 'tv';
export type PublishStatus = 'draft' | 'pending' | 'published' | 'rejected';
export type AgeRating = 'P' | 'K' | 'T13' | 'T16' | 'T18' | 'C';

export interface Category {
  id: string;
  public_id: string; // 24 hex
  name: string;
  slug: string;
  parent_id: string | null;
  icon?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  sort_order: number;
  is_visible: boolean;
  platforms: Platform[];
  applies_to: AppliesTo[];
}

export interface Video {
  id: string;
  public_id: string; // 24 hex
  title: string;
  english_title?: string | null;
  slug: string;
  description?: string | null;
  poster_vertical?: string | null;
  backdrop_horizontal?: string | null;
  thumbnail?: string | null;
  trailer_url?: string | null;
  hls_url?: string | null;
  dash_url?: string | null;
  duration_seconds?: number | null;
  release_year?: number | null;
  age_rating: AgeRating;
  directors: string[];
  casts: string[];
  country?: string | null;
  quality?: 'SD' | 'HD' | '4K' | null;
  view_count: number;
  status: PublishStatus;
}

export type Movie = Video;

export interface Episode {
  id: string;
  movie_id: string;
  episode_number: number;
  title: string;
  thumbnail?: string | null;
  video_hls_url?: string | null;
  duration_text?: string | null;
  description?: string | null;
}
