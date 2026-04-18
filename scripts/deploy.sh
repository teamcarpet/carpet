#!/usr/bin/env bash
# CARPET Platform deployment helper
set -e

echo "=== CARPET Deploy ==="

# 1. Check .env
if [ ! -f .env ]; then
  echo "⚠  .env not found — copying from .env.example"
  cp .env.example .env
  echo "   Edit .env and re-run."
  exit 1
fi

# 2. Install dependencies
echo "→ Installing dependencies..."
npm install

# 3. Build
echo "→ Building..."
npm run build

echo "✓ Build complete: dist/"
echo ""
echo "Deploy options:"
echo "  Static: npx serve dist"
echo "  Vercel: vercel --prod"
echo "  Netlify: netlify deploy --prod --dir dist"
echo ""
echo "⚠  Also start the backend server for LiveKit support:"
echo "  node server/index.js"
