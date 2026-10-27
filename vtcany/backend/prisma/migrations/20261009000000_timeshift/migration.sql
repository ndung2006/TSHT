-- Xem lai (timeshift): kenh nao duoc bat ghi + che do src (VD 'after' cho VOV1)
ALTER TABLE "channel_overrides" ADD COLUMN "timeshift_enabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "channel_overrides" ADD COLUMN "timeshift_src" TEXT;

-- Seed 4 kenh AIO co bat ghi (do tren prod 09/10/2026): LAICHAU, ANGIANG1,
-- VOV1 (ghi sau-encode -> src='after'), LAMDONG1 (ghi goc)
INSERT INTO "channel_overrides" ("channel_key", "timeshift_enabled", "timeshift_src", "created_at", "updated_at")
VALUES ('LAICHAU', TRUE, NULL, NOW(), NOW()), ('ANGIANG1', TRUE, NULL, NOW(), NOW()), ('VOV1', TRUE, 'after', NOW(), NOW()), ('LAMDONG1', TRUE, NULL, NOW(), NOW())
ON CONFLICT ("channel_key") DO UPDATE SET "timeshift_enabled" = TRUE, "timeshift_src" = EXCLUDED."timeshift_src", "updated_at" = NOW();
