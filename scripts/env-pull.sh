#!/usr/bin/env bash
# ─── Safe vercel env pull ────────────────────────────────────────────────────
# Use this instead of `vercel env pull` directly.
# It backs up .env.local before pulling so you never lose keys.

set -euo pipefail

ENV_FILE=".env.local"
BACKUP_DIR=".env-backups"

if [ -f "$ENV_FILE" ]; then
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP="$BACKUP_DIR/${ENV_FILE##*/}.$TIMESTAMP"
  cp "$ENV_FILE" "$BACKUP"
  echo "[env-pull] Backed up $ENV_FILE -> $BACKUP"
fi

echo "[env-pull] Running vercel env pull..."
npx vercel env pull "$ENV_FILE" --environment=development

echo ""
echo "[env-pull] Done. Verify your .env.local looks correct."
echo "[env-pull] If something went wrong, restore from: $BACKUP"
