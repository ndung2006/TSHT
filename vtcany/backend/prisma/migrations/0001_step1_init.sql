-- Bước 1/8 — Migration khởi tạo schema VTC ANY (Mục 2 + Phụ lục 2 tài liệu v2).
-- Chạy: psql $DATABASE_URL -f backend/prisma/migrations/0001_step1_init.sql
-- Quy ước: public_id VARCHAR(24) UNIQUE (24 ký tự hex, giống MongoDB ObjectId),
-- URL public: /{type}/{slug}-{public_id}. Sinh bằng generatePublicId() trong packages/contracts.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ 2.1 Content ============
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id VARCHAR(24) UNIQUE NOT NULL CHECK (public_id ~ '^[0-9a-f]{24}$'),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  icon VARCHAR(1000),
  thumbnail VARCHAR(1000),
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  platforms TEXT[] NOT NULL DEFAULT '{WEB}',
  applies_to TEXT[] NOT NULL DEFAULT '{phim}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id VARCHAR(24) UNIQUE NOT NULL CHECK (public_id ~ '^[0-9a-f]{24}$'),
  title VARCHAR(500) NOT NULL,
  english_title VARCHAR(500),
  slug VARCHAR(500) NOT NULL,
  description TEXT,
  poster_vertical VARCHAR(1000),
  backdrop_horizontal VARCHAR(1000),
  thumbnail VARCHAR(1000),
  trailer_url VARCHAR(1000),
  hls_url VARCHAR(1000),
  dash_url VARCHAR(1000),
  duration_seconds INT,
  release_year INT,
  age_rating VARCHAR(10) NOT NULL DEFAULT 'P',
  directors TEXT[] NOT NULL DEFAULT '{}',
  casts TEXT[] NOT NULL DEFAULT '{}',
  country VARCHAR(100),
  quality VARCHAR(10),
  intro_start_time INT,
  intro_end_time INT,
  is_downloadable BOOLEAN NOT NULL DEFAULT TRUE,
  view_count BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_videos_slug ON videos(slug);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  episode_number INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  thumbnail VARCHAR(1000),
  video_hls_url VARCHAR(1000),
  duration_text VARCHAR(20),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (movie_id, episode_number)
);

CREATE TABLE IF NOT EXISTS live_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id VARCHAR(24) UNIQUE NOT NULL CHECK (public_id ~ '^[0-9a-f]{24}$'),
  name VARCHAR(255) NOT NULL,
  logo VARCHAR(1000),
  hls_url VARCHAR(1000),
  group_name VARCHAR(255) NOT NULL DEFAULT 'Kênh VTV',
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  drm_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS epg_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES live_channels(id) ON DELETE CASCADE,
  program_name VARCHAR(500) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  thumbnail VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_epg_channel_time ON epg_schedules(channel_id, start_time);

CREATE TABLE IF NOT EXISTS shorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id VARCHAR(24) UNIQUE NOT NULL CHECK (public_id ~ '^[0-9a-f]{24}$'),
  title VARCHAR(500) NOT NULL,
  video_url VARCHAR(1000),
  thumbnail VARCHAR(1000),
  duration_seconds INT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  music_title VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============ 2.2 Media library ============
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url VARCHAR(1000),
  object_key VARCHAR(1000),
  file_type VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============ 2.3 Users & Auth ============
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50) UNIQUE,
  avatar VARCHAR(1000),
  provider VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  avatar_url VARCHAR(500),
  is_kids_profile BOOLEAN NOT NULL DEFAULT FALSE,
  pin_code VARCHAR(4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  device_info JSONB,
  ip VARCHAR(100),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login TIMESTAMPTZ
);

-- ============ 2.4 Monetization ============
CREATE TABLE IF NOT EXISTS subscription_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price BIGINT NOT NULL DEFAULT 0,
  cycle VARCHAR(20) NOT NULL DEFAULT 'month',
  benefits JSONB NOT NULL DEFAULT '{}',
  max_devices INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code VARCHAR(100) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  package_id UUID REFERENCES subscription_packages(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  method VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  discount_percent INT,
  discount_amount BIGINT,
  usage_limit INT,
  used_count INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

-- ============ Phụ lục 2 ============
CREATE TABLE IF NOT EXISTS video_subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL,
  language_name VARCHAR(50) NOT NULL,
  subtitle_url VARCHAR(1000) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(100) NOT NULL,
  target_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_module_time ON audit_logs(module, created_at);

-- ============ Dự phòng Bước 2 (layout) + Bước 8 (watch history) ============
CREATE TABLE IF NOT EXISTS layout_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL DEFAULT 'WEB',
  "order" INT NOT NULL DEFAULT 0,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500),
  target_url VARCHAR(1000),
  card_aspect VARCHAR(10),
  config JSONB NOT NULL DEFAULT '{"items": []}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_layout_platform ON layout_blocks(platform) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS watch_history (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL,
  position_seconds INT NOT NULL DEFAULT 0,
  bitrate VARCHAR(20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, content_id)
);
