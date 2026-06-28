#!/bin/bash

set -e

echo "🚀 Immochecker Railway Setup"
echo "=============================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📥 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "🔐 Logging into Railway..."
railway login

# Create project
echo "📦 Creating Railway project..."
railway init --name immochecker

# Add PostgreSQL
echo "🗄️  Adding PostgreSQL database..."
railway add --service postgresql

# Set environment variables
echo "⚙️  Setting environment variables..."
railway variables set PORT=3000
railway variables set NODE_ENV=production
railway variables set SCRAPE_INTERVAL_CRON="0 */6 * * *"
railway variables set SCRAPE_CONCURRENCY=3
railway variables set SCRAPE_DELAY_MS=1500
railway variables set USER_AGENT="Mozilla/5.0 (compatible; ImmocheckerBot/1.0)"
railway variables set PURGE_AFTER_DAYS=30

# Link services
echo "🔗 Linking services..."
railway link

# Deploy
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your app is live at: $(railway domain)"
echo ""
echo "Test it:"
echo "  curl $(railway domain)/api/health"
