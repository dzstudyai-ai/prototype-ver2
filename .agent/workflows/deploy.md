---
description: Deploy the full project for free using Render (backend) + Vercel (frontend)
---

# Free Hosting Deployment

## Prerequisites
- GitHub account (push your project first)
- Supabase project already set up

---

## Step 1: Push to GitHub

```bash
cd C:\Users\zix\Desktop\prototype
git init
git add .
git commit -m "initial commit"
```

Create a repo on github.com, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy Backend on Render (Free)

1. Go to https://render.com → Sign up with GitHub
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name**: `classement-api`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add **Environment Variables**:
   - `SUPABASE_URL` = your Supabase URL
   - `SUPABASE_SERVICE_KEY` = your service role key
   - `JWT_SECRET` = your JWT secret
   - `NODE_ENV` = production
   - `PORT` = 10000
6. Click **Create Web Service**
7. Wait for deploy → note the URL (e.g. `https://classement-api.onrender.com`)

> **Note**: Free Render services sleep after 15min of inactivity. First request may take ~30s to wake up.

---

## Step 3: Update Frontend API URL

Before deploying the frontend, update `vite.config.js` to remove the proxy (it only works in dev mode). Instead, configure the API base URL.

// turbo
Create a file `frontend/.env.production`:
```
VITE_API_URL=https://classement-api.onrender.com
```

Then update all axios calls to use the base URL. The simplest way is to set axios defaults.

Create `frontend/src/api.js`:
```js
import axios from 'axios';
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});
export default api;
```

Replace `import axios from 'axios'` with `import api from '../api'` in all components.

---

## Step 4: Deploy Frontend on Vercel (Free)

1. Go to https://vercel.com → Sign up with GitHub
2. Click **Add New** → **Project**
3. Import your GitHub repo
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add **Environment Variables**:
   - `VITE_API_URL` = `https://classement-api.onrender.com`
6. Click **Deploy**
7. Your site will be live at `https://your-project.vercel.app`

---

## Step 5: Update CORS on Backend

After deploying, update `backend/server.js` CORS config:

```js
app.use(cors({
  origin: ['https://your-project.vercel.app', 'http://localhost:5173'],
  credentials: true
}));
```

Push the change and Render will auto-redeploy.

---

## Summary

| Service | What | Cost | URL |
|---|---|---|---|
| **Supabase** | Database | Free tier | dashboard.supabase.com |
| **Render** | Backend API | Free tier | classement-api.onrender.com |
| **Vercel** | Frontend | Free tier | your-project.vercel.app |

Total cost: **$0**
