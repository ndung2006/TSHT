-- Mua phim + trailer theo mau VTCPlay CMS.
-- Phim bo: tap phim va trailer nam theo mua. Phim le: trailer nam truc tiep duoi phim.

-- CreateTable
CREATE TABLE "catalog_seasons" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_trailers" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT,
    "season_id" TEXT,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_trailers_pkey" PRIMARY KEY ("id")
);

-- Tap phim thuoc mua (phim bo); NULL = tap truc tiep cua phim (phim le).
ALTER TABLE "catalog_episodes" ADD COLUMN "season_id" TEXT;

-- CreateIndex
CREATE INDEX "catalog_episodes_season_id_created_at_idx" ON "catalog_episodes"("season_id", "created_at");

-- CreateIndex
CREATE INDEX "catalog_seasons_movie_id_created_at_idx" ON "catalog_seasons"("movie_id", "created_at");

-- CreateIndex
CREATE INDEX "catalog_trailers_movie_id_created_at_idx" ON "catalog_trailers"("movie_id", "created_at");

-- CreateIndex
CREATE INDEX "catalog_trailers_season_id_created_at_idx" ON "catalog_trailers"("season_id", "created_at");
