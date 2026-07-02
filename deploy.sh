#!/bin/bash

set -e

echo "🚀 Immochecker Production Build & Local Test"
echo "============================================"
echo ""

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current version: $(node -v)"
  exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check .env file
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Creating from .env.example..."
  cp .env.example .env
  echo "📝 Please edit .env with your PostgreSQL DATABASE_URL"
  echo "   Then run this script again."
  exit 0
fi

echo "✅ .env file found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --omit=dev > /dev/null 2>&1 || npm install
echo "✅ Dependencies installed"

# Type checking
echo ""
echo "🔍 Running type checks..."
npm run type-check > /dev/null 2>&1
echo "✅ Type checks passed"

# Build
echo ""
echo "🔨 Building all packages..."
npm run build > /dev/null 2>&1
echo "✅ Build complete"

# Summary
echo ""
echo "✅ All checks passed!"
echo ""
echo "To test locally:"
echo "  PORT=3000 npm run start"
echo ""
echo "Then visit:"
echo "  http://localhost:3000"
echo ""
echo "To deploy to Railway:"
echo "  git push"
echo ""


