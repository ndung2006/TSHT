-- Quan tri hien thi kenh truyen hinh AIO tren BE (channel_overrides).
CREATE TABLE "channel_overrides" (
    "channel_key" TEXT NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER,
    "group_name" TEXT,
    "display_name" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "banner_url" TEXT,
    "plan_id" TEXT,
    "hls_url" TEXT,
    "dash_url" TEXT,
    "catchup_hls_url" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_overrides_pkey" PRIMARY KEY ("channel_key")
);
