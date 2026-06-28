# Railway + PostgreSQL Deployment Guide

Complete guide to deploy Immochecker on Railway with PostgreSQL database.

## Quick Overview

- **App**: Railway (Node.js/Express)
- **Database**: Railway PostgreSQL (free tier)
- **Frontend**: Served from Express app
- **Cost**: FREE (Railway gives $5 credit/month, PostgreSQL free)
- **Setup time**: 10 minutes

## Step 1: Connect GitHub Repository to Railway

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Click **"Configure GitHub App"** and authorize
5. Select your `immochecker` repository
6. Railway auto-detects Node.js and creates a service
7. Wait for initial build (this will fail - that's OK, we'll fix it)

## Step 2: Add PostgreSQL Service

1. In Railway dashboard, click **"+ New"** 
2. Select **"Database"** → **"PostgreSQL"**
3. Railway creates a PostgreSQL instance automatically
4. The `DATABASE_URL` environment variable is set automatically ✅

## Step 3: Link Services

Railway should auto-link them, but verify:

1. Click on your **Node.js app** service
2. Go to **"Variables"** tab
3. You should see `DATABASE_URL` is already set (from PostgreSQL service)
4. If not, copy it from the PostgreSQL service details

## Step 4: Configure Environment Variables

In your **Node.js service**, go to **Variables** tab and add:

```
PORT=3000
NODE_ENV=production
SCRAPE_INTERVAL_CRON=0 */6 * * *
SCRAPE_CONCURRENCY=3
SCRAPE_DELAY_MS=1500
USER_AGENT=Mozilla/5.0 (compatible; ImmocheckerBot/1.0)
PURGE_AFTER_DAYS=30
```

`DATABASE_URL` should already be there from PostgreSQL service link.

## Step 5: Verify Procfile & railway.toml

The repository already contains:

**`Procfile`**:
```
web: npm run build && npm run start
```

**`railway.toml`**:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run build && npm run start"
```

These tell Railway how to build and start your app. ✅

## Step 6: Deploy!

1. **Push to GitHub**:
```bash
git add -A
git commit -m "Deploy to Railway with PostgreSQL"
git push origin main
```

2. **Railway auto-deploys** - monitor in dashboard
3. Wait for "Deployment Successful" message ✅
4. Your app is live!

## Step 7: Test Your App

Once deployment succeeds:

```bash
# Test health endpoint
curl https://your-railway-url.railway.app/api/health
# Response: {"status":"ok"}

# Test kantoren endpoint  
curl https://your-railway-url.railway.app/api/kantoren
# Response: [] (empty at first)

# Visit frontend
https://your-railway-url.railway.app/
```

## Troubleshooting

### Build Fails: "npm ERR!"

**Cause**: Dependency issue

**Solution**: 
1. Check `package.json` for missing dependencies
2. Run locally: `npm install` then `npm run build`
3. Push fix to GitHub

### "DATABASE_URL not set in .env"

**Cause**: PostgreSQL service not linked

**Solution**:
1. Go to PostgreSQL service in Railway
2. Copy the connection string
3. In Node.js service Variables, paste as `DATABASE_URL`
4. Re-deploy

### App Crashes: "Could not find module 'pg'"

**Cause**: Dependencies not installed

**Solution**:
1. Ensure `package.json` has `"pg": "^8.11.3"` in dependencies
2. Run `npm install` locally
3. Commit `package-lock.json` to Git
4. Push to GitHub

### Database Connection Timeout

**Cause**: PostgreSQL not ready or IP blocked

**Solution**:
1. Wait 2-3 minutes after adding PostgreSQL
2. Check PostgreSQL service is "Running" (green status)
3. Try manual connection test via Railway

## What PostgreSQL Tables Get Created?

The API auto-creates the `panden` table with:

```sql
CREATE TABLE panden (
  id SERIAL PRIMARY KEY,
  kantoor_id INTEGER NOT NULL,
  kantoor_naam VARCHAR(255),
  externe_id VARCHAR(255),
  bron_url VARCHAR(2048) UNIQUE,
  type VARCHAR(50),
  titel VARCHAR(500),
  beschrijving TEXT,
  gemeente VARCHAR(255),
  postcode VARCHAR(10),
  prijs INTEGER,
  slaapkamers INTEGER,
  woonoppervlakte_m2 INTEGER,
  perceel_m2 INTEGER,
  epc VARCHAR(1),
  fotos TEXT[],
  status VARCHAR(20),
  eerst_gezien TIMESTAMP,
  laatst_gezien TIMESTAMP,
  UNIQUE(kantoor_id, externe_id)
);
```

Indexes are created automatically. No manual setup needed! ✅

## Data Persistence

PostgreSQL on Railway:

- ✅ **Persistent**: Data survives restarts
- ✅ **Backed up**: Railway does daily backups
- ✅ **Scalable**: Can grow as needed
- ✅ **Secure**: Encrypted connection (SSL)

## Monitoring

### View Logs

In Railway dashboard:
1. Click Node.js service
2. Go to **"Logs"** tab
3. Filter by "Runtime" or "Deployment"

Key logs:
```
"Connected to PostgreSQL"           ✅ DB connection OK
"Server running on port 3000"       ✅ API started
"Running scheduled scrape..."       ✅ Cron job running
```

### Monitor PostgreSQL

1. Click PostgreSQL service in dashboard
2. See connection count, storage usage
3. View database logs if needed

## Scaling Up

Railway free tier:
- Includes $5 credits/month
- Node.js: Uses ~$0.07/day (easily within free tier)
- PostgreSQL: Free tier included
- Total: **FREE** ✅

To upgrade (optional):
- Paid Railway plans start at $5/month per service
- Get guaranteed uptime and better performance

## Next Steps

1. **Optional**: Setup monitoring
   - Railway has built-in email alerts
   - Set up in Railway settings

2. **Optional**: Add custom domain
   - Railway supports custom domains
   - Go to service settings → "Domain"

3. **Monitor**: Check logs weekly for errors
   - Fix any bugs found in production

4. **Scale**: If you add more kantoren, just increase Railway plan

## Support & Docs

- **Railway docs**: https://docs.railway.app/
- **PostgreSQL docs**: https://www.postgresql.org/docs/
- **This project**: Check README.md for more info

## Summary

| Step | Done? |
|------|-------|
| GitHub connected | ✅ |
| PostgreSQL service added | ✅ |
| Environment variables set | ✅ |
| App deployed | ✅ |
| Database auto-created | ✅ |
| API responding | ✅ |
| Frontend loading | ✅ |
| Data persistent | ✅ |

**You're done! App is live on Railway with PostgreSQL!** 🎉
