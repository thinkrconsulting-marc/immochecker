# Render.com Deployment Guide

Complete guide to deploy Immochecker on Render.com with PostgreSQL.

## Why Render?

- ✅ Free tier with PostgreSQL included
- ✅ Auto-deploys from GitHub
- ✅ Automatic SSL/HTTPS
- ✅ Better uptime than Railway free tier
- ✅ PostgreSQL automatically created
- ✅ Environment variables auto-linked

## Quick Start (2 minutes)

### Step 1: Create Render Account

1. Go to: https://render.com
2. Sign up with GitHub (recommended)
3. Authorize Render to access your GitHub

### Step 2: Deploy from GitHub

1. Go to: https://dashboard.render.com
2. Click: **"New +"** 
3. Select: **"Web Service"**
4. Connect your GitHub repo: `thinkrconsulting-marc/immochecker`
5. Render auto-detects the `render.yaml` configuration ✅

### Step 3: Add PostgreSQL Database

1. In Render dashboard, click: **"New +"**
2. Select: **"PostgreSQL"**
3. Set name: `immochecker-db`
4. Click: **"Create Database"**

### Step 4: Link Database to App

1. Click on your **Web Service** (immochecker)
2. Go to **"Environment"** 
3. Add variable:
   ```
   DATABASE_URL={{db.internal_database_url}}
   ```
   (Or copy from PostgreSQL service)

### Step 5: Deploy!

1. Click **"Manual Deploy"** or wait for GitHub push
2. Render builds and deploys automatically
3. You get a URL like: `https://immochecker-xxx.onrender.com`

---

## Your App is Live! 🎉

Test it:
```bash
curl https://your-render-url.onrender.com/api/health
# Response: {"status":"ok"}

curl https://your-render-url.onrender.com/api/kantoren
# Response: [{"id":1,"naam":"GVE",...}]
```

Visit: `https://your-render-url.onrender.com/`

---

## Important Notes

### Free Tier Limitations
- App spins down after 15 minutes of inactivity
- First request takes ~30 seconds (spin-up time)
- PostgreSQL has 256MB storage (plenty for this project)

### Upgrade to Paid (Optional)
- Starter plan: $7/month per service
- Get always-on uptime
- Better performance

### Environment Variables

Render auto-populates from `render.yaml`:
- `DATABASE_URL` - PostgreSQL connection
- `NODE_ENV=production`
- `PORT=3000`
- All cron/scraper settings

### Database Auto-Setup

When the API starts:
1. Creates `immochecker` database
2. Creates `panden` table
3. Sets up indexes
4. Ready to use!

No manual SQL needed! ✅

---

## Monitoring

### View Logs

1. Dashboard → Web Service → **"Logs"**
2. Look for:
   ```
   "Connected to PostgreSQL"      ✅ Database OK
   "Server running on port 3000"  ✅ API started
   ```

### Monitor Database

1. Dashboard → PostgreSQL → **"Info"**
2. See connection stats, storage usage
3. View logs if needed

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check build logs. Usually dependency issue. |
| "Cannot connect to database" | Make sure DATABASE_URL is set. Check PostgreSQL service status. |
| App spins down | Normal on free tier. Click service to wake up. |
| 502 Bad Gateway | App crashed. Check logs. |

---

## Next Steps

1. **Monitor Logs** - Watch first deploy
2. **Test API** - Call endpoints to verify
3. **Setup Monitoring** - Render offers alerts (paid)
4. **Custom Domain** (Optional) - Add your domain

---

## Docs

- **Render docs**: https://render.com/docs
- **PostgreSQL on Render**: https://render.com/docs/databases
- **This project**: See README.md

---

## Summary

| Component | Status |
|-----------|--------|
| GitHub connected | ✅ |
| PostgreSQL created | ✅ |
| App deployed | ✅ |
| Environment linked | ✅ |
| Database auto-setup | ✅ |
| API responding | ✅ |
| Frontend loading | ✅ |

**Your app is live on Render!** 🚀
