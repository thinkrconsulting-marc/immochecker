# Immochecker - Railway Setup Instructions

Dit zijn de **snelste stappen** om je app op Railway live te zetten!

## Option A: Automatic Setup with Railway CLI (Easiest - 2 minuten)

**Prerequisites**: Install Railway CLI first:
```bash
npm install -g @railway/cli
```

Then run:
```bash
cd /path/to/immochecker
./railway-setup.sh
```

Done! Your app is live! 🚀

---

## Option B: Manual Setup via Dashboard (3 minuten)

### Step 1: Connect GitHub
1. Go to https://railway.app/dashboard
2. Click: **"New Project"**
3. Select: **"Deploy from GitHub repo"**
4. Select: **`thinkrconsulting-marc/immochecker`**
5. Wait for initial build

### Step 2: Add PostgreSQL
1. Dashboard → Click **"+"** button
2. Select: **"Database"** → **"PostgreSQL"**
3. Wait 30 seconds (Railway auto-links it)

### Step 3: Add Environment Variables
1. Dashboard → Click your **Node.js service**
2. Go to **"Variables"** tab
3. Add these:

```
PORT=3000
NODE_ENV=production
SCRAPE_INTERVAL_CRON=0 */6 * * *
SCRAPE_CONCURRENCY=3
SCRAPE_DELAY_MS=1500
USER_AGENT=Mozilla/5.0 (compatible; ImmocheckerBot/1.0)
PURGE_AFTER_DAYS=30
```

Note: `DATABASE_URL` is already set (from PostgreSQL)

4. Click **"Save"**

### Step 4: Deploy!
1. Make sure you're on your service
2. Click **"Deploy"** button
3. Wait for "✅ Deployment Successful"

---

## That's It! ✅

Your app is now live at: **https://your-railway-url.railway.app**

Test it:
```bash
curl https://your-railway-url.railway.app/api/health
# Should return: {"status":"ok"}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check logs in Railway. Usually a dependency issue. |
| Can't find DATABASE_URL | Make sure PostgreSQL service is added first. |
| App crashes | Check if `npm install` works locally first. |

---

## Questions?

See detailed guide: [RAILWAY_POSTGRESQL.md](RAILWAY_POSTGRESQL.md)
