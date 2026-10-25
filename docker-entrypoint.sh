#!/bin/sh
# Khoi phuc du lieu seed vao volume storage neu volume dang trong.
# Ly do: khi Coolify mount volume vao /app/storage, volume trong se che
# mat file seed co san trong image. Chi copy khi thieu file cover cua so 319,
# nen cac file upload qua CMS sau do khong bi ghi de khi redeploy.
set -e
STORAGE_DIR="${STORAGE_DIR:-/app/storage}"
mkdir -p "$STORAGE_DIR"
if [ ! -f "$STORAGE_DIR/epaper/2026/10/1/cover.jpg" ] && [ -d /app/storage-seed ]; then
  echo "storage trong: copy du lieu seed 319/558 vao $STORAGE_DIR"
  cp -r /app/storage-seed/. "$STORAGE_DIR"/
fi
exec "$@"
