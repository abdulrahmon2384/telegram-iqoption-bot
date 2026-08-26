# SignalBot — Telegram IQ Option Automated Trading Engine

An automated Telegram VIP signal listener, parser, and IQ Option binary trading bot with 24/7 background sync, persistent Supabase database storage, real-time WebSocket execution, and PWA native capabilities.

---

## 🚀 Deploying on Render (render.com)

This application is configured for direct, zero-configuration deployment on **Render**.

### Method 1: Using Render Blueprint (`render.yaml`) — Recommended

1. Push this repository to **GitHub** or **GitLab**.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Blueprint**.
4. Select your repository. Render will automatically read `render.yaml` and configure:
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
5. Fill in the optional environment variables in the Render Dashboard (see below).
6. Click **Apply** to deploy!

---

### Method 2: Manual Web Service Configuration on Render

If you prefer setting up manually without Blueprints:

1. Click **New +** → **Web Service** in Render.
2. Connect your Git repository.
3. Configure the following settings:
   - **Name:** `telegram-iqoption-trading-bot` (or your preferred name)
   - **Language / Runtime:** `Node`
   - **Branch:** `main` (or your default branch)
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Starter` (recommended for continuous background Telegram listeners) or `Free`
   - **Health Check Path:** `/api/health`

4. Under **Advanced / Environment Variables**, add:
   | Variable Name | Description | Required |
   | ------------- | ----------- | -------- |
   | `NODE_ENV` | Set to `production` | Yes |
   | `VITE_SUPABASE_URL` | Your Supabase Project URL | Optional (for persistent cloud storage) |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public API key | Optional |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role secret key | Optional |
   | `GEMINI_API_KEY` | Gemini API key | Optional |

5. Click **Create Web Service**. Render will automatically build and start the application.

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local dev server (Hot Reloading + Live Server)
npm run dev

# 3. Build for production
npm run build

# 4. Start production server locally
npm start
```

---

## ⚙️ Architecture & Build Verification

- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite (bundled to `/dist`).
- **Backend:** Express, GramJS (Telegram MTProto), IQ Option Live WebSocket client (bundled with `esbuild` to `/dist/server.cjs`).
- **Port:** Automatically binds to Render's dynamic `$PORT` environment variable with graceful fallback to `3000`.
- **Health Check:** `/api/health` responds with `200 OK` and system diagnostic status.
