# Immochecker Railway Deployment Guide

Complete step-by-step guide to deploy Immochecker to Railway.

## Prerequisites

- Railway.app account (free tier available at https://railway.app)
- GitHub repository containing this code
- MongoDB Atlas account (free tier available at https://www.mongodb.com/cloud/atlas)

## Quick Start (5 minutes)

### 1. MongoDB Atlas Setup

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up / Log in
3. Create a free cluster (M0 tier is free)
4. Wait for cluster to be ready (~3 minutes)
5. Click "Connect" → "Drivers" → "Python"
6. Copy the connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)
7. Replace `<password>` and `<username>` with your actual credentials

### 2. Railway Project Setup

1. Go to https://railway.app/dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Authorize GitHub access and select this repository
4. Railway will auto-detect it's a Node.js project

### 3. Configure Environment Variables

In Railway dashboard, click on your service and go to "Variables":

Add these variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/immochecker
NODE_ENV=production
PORT=3000
SCRAPE_INTERVAL_CRON=0 */6 * * *
SCRAPE_CONCURRENCY=3
SCRAPE_DELAY_MS=1500
USER_AGENT=Mozilla/5.0 (compatible; ImmocheckerBot/1.0)
PURGE_AFTER_DAYS=30
```

Replace the MongoDB URI with your actual credentials from Atlas.

### 4. Deploy

1. Railway auto-detects the build/start commands from:
   - `railway.toml` (first priority)
   - `Procfile` (second priority)
   - package.json scripts (fallback)

2. The build command is: `npm run build`
3. The start command is: `npm run start`

4. Push a commit to trigger deployment:
   ```bash
   git add -A
   git commit -m "Deploy to Railway"
   git push
   ```

5. Monitor deployment in Railway dashboard

### 5. Access Your App

Once deployment is complete (shows "success" in Railway):

- **Frontend**: https://your-railway-url.railway.app/
- **API**: https://your-railway-url.railway.app/api/panden
- **Health check**: https://your-railway-url.railway.app/api/health

You can find your Railway URL in the domain section of the service.

## What Happens During Deployment

1. **Build Phase** (3-5 minutes):
   - Node.js 18+ runtime is prepared
   - `npm install` runs to install all dependencies
   - `npm run build` compiles TypeScript and builds React
   - Artifacts are cached for faster subsequent deployments

2. **Start Phase**:
   - `npm run start` runs the command
   - This runs: `npm --workspace=@immochecker/api start`
   - API server starts on port 3000
   - React static files are served from /dist
   - Cron jobs are configured

3. **Health Check**:
   - Railway pings `/api/health` endpoint
   - If healthy, deployment is marked as successful
   - App is ready to receive traffic

## MongoDB Collections Setup

The first time the API starts, it automatically:
1. Connects to MongoDB
2. Creates the `immochecker` database (if needed)
3. Creates the `panden` collection (if needed)
4. Creates necessary indexes:
   - `bron_url` (unique)
   - `(kantoor_id, externe_id)` (unique)
   - Status, gemeente, prijs, date indexes for queries

No manual database setup is needed!

## Testing Your Deployment

### 1. Check Health

```bash
curl https://your-railway-url.railway.app/api/health
# Response: {"status":"ok"}
```

### 2. Check Kantoren

```bash
curl https://your-railway-url.railway.app/api/kantoren
# Response: [{"id":1,"naam":"GVE",...}, ...]
```

### 3. Check Empty Panden (before scraping)

```bash
curl https://your-railway-url.railway.app/api/panden
# Response: {"panden":[],"total":0,"page":1,"pages":0}
```

## Troubleshooting

### Build Fails: "Node version mismatch"

**Solution**: The project requires Node.js 18+

In Railway, update the nixpacks builder config or set in railway.toml:
```toml
[build]
nixPackages = ["nodejs"]
```

### Build Fails: "tsc not found"

**Solution**: Ensure devDependencies are installed

Railway might be in production mode. Force full install:
```
NPM_PRODUCTION=false
```

### Deployment Shows "Success" but App is Blank

**Solution**: Static files path issue

Check Railway logs for errors. Ensure:
1. Web package built: `packages/web/dist/index.html` exists
2. API is serving static files correctly

Run locally first:
```bash
npm run build
PORT=3000 npm run start
# Visit http://localhost:3000
```

### MongoDB Connection Fails

**Errors**: "connect ENOTFOUND", "authentication failed"

**Solutions**:
1. Verify MONGODB_URI format (must include username:password)
2. Check MongoDB Atlas whitelist settings
3. For local development, add your IP to Atlas whitelist
4. For Railway, Atlas should already accept all IPs (check your settings)
5. Test connection string locally first

### Scraper Not Running

The scraper is configured to run automatically:
- Every 6 hours: `0 */6 * * *` (cron expression)
- Daily purge at 03:00: `0 3 * * *`

Check Railway logs for cron job output. Logs should show:
```
Running scheduled scrape...
Running purge job...
```

### App Too Slow

Causes:
1. **First deploy is slower**: Node modules are being installed (3-5 min)
2. **Railway free tier**: Limited resources, app might be slower
3. **MongoDB query**: Large dataset, missing indexes

Solutions:
1. Upgrade Railway plan for better performance
2. Ensure MongoDB indexes are created (automatic on first connect)
3. Add caching layer (future enhancement)

## Production Monitoring

### Enable Logs

In Railway dashboard:
1. Go to your service
2. Click "Logs" tab
3. Filter by "Deployment" or "Runtime"

Key logs to watch:
```
"Server running on port 3000"           ✅ API started
"Connected to MongoDB"                  ✅ Database connected
"Running scheduled scrape..."           ✅ Scraping job triggered
```

### Set Alerts

Configure Railway alerts for:
- Build failures
- Runtime crashes
- Memory usage > 80%
- CPU usage > 90%

## Scaling Up

Railway free tier includes:
- 500 hours/month compute
- 5GB storage (for logs/database if you add PostgreSQL)
- Auto-sleep if no traffic for 7 days

To stay within free limits:
- Disable auto-sleep in Railway settings if you want continuous scraping
- Monitor usage in Railway dashboard

For production:
- Upgrade to paid Railway plan ($5/month minimum)
- Get 24/7 uptime without auto-sleep
- Better performance and reliability

## Useful Railway Commands

### View Logs (if Railway CLI installed)

```bash
railway login
railway logs
```

### Re-deploy Last Commit

In Railway dashboard: Service → Settings → Re-deploy

### View Environment Variables

```bash
railway variables
```

## Next Steps

After deployment:

1. **Monitor first scrape** (~15 minutes after start)
   - Check logs for "Running scheduled scrape..."
   - Verify data appears in API response: `/api/kantoren`

2. **Verify scrapers work**
   - Call `/api/panden` - should show results
   - Call `/api/panden?gemeente=Leuven` - filter test
   - Call `/api/panden/nieuw` - new listings

3. **Setup monitoring**
   - Create Railway alerts for failures
   - Setup error tracking (Sentry integration available)

4. **Optional enhancements**
   - Add Vercel for CDN (serve frontend separately)
   - Add Redis for caching (paid)
   - Setup GitHub integration for auto-deploy on push

## Support

- Railway docs: https://docs.railway.app/
- MongoDB Atlas docs: https://docs.atlas.mongodb.com/
- Immochecker GitHub: This repository

For issues, check:
1. Railway logs (usually contains the solution)
2. MongoDB Atlas connection status
3. Environment variables are set correctly
4. Node.js version is 18+
