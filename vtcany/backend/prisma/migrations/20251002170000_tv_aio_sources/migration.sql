-- Nguon phat VTCAIO cau hinh trong CMS (truyen-hinh): nhieu domain + token key,
-- quet kênh truoc khi kich hoat.
CREATE TABLE "tv_aio_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "token_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_aio_sources_pkey" PRIMARY KEY ("id")
);
