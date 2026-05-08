# Deployment Steps for AppForge Submission

This document provides exact step-by-step instructions to deploy to Vercel and submit the project.

## Step 1: Create a GitHub Repository

1. Go to https://github.com/new
2. Name it: `appforge-project` (or similar)
3. Set to **Public** (for company evaluation)
4. Click "Create repository"
5. Copy the repository URL (format: `https://github.com/<YOUR_USERNAME>/appforge-project.git`)

## Step 2: Push Your Code to GitHub

From your local project directory, run:

```bash
cd c:\Users\SANDWICH\Downloads\appforge-project
git remote add origin https://github.com/<YOUR_USERNAME>/appforge-project.git
git branch -M main
git push -u origin main
```

**Verify:** Check https://github.com/<YOUR_USERNAME>/appforge-project to confirm all files are uploaded.

## Step 3: Create a Vercel Account and Deploy

1. Go to https://vercel.com/new
2. Sign in with GitHub (you'll be prompted)
3. Select "Import Git Repository"
4. Find and select `appforge-project` from your list
5. Click "Import"
6. **Framework Preset:** Confirm it shows "Next.js"
7. **Environment Variables (optional):** Leave empty unless you have OPENAI_API_KEY
8. Click "Deploy"
9. **Wait 2-3 minutes** for the build to complete
10. Once done, you'll see your **Live URL** (e.g., `https://appforge-project.vercel.app`)
11. **Copy this URL** — you'll need it for the submission form

**Test your deployment:**
- Open the Live URL in your browser
- Verify the dashboard loads
- Run a single compile or the benchmark test

## Step 4: Configure GitHub Actions Secrets (Optional)

The GitHub Actions workflow will automatically deploy on every push to `main`. To enable this:

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add:

   **Secret 1: VERCEL_TOKEN**
   - Value: Get from https://vercel.com/account/tokens
   - Click "Create" and copy the token
   
   **Secret 2: VERCEL_ORG_ID**
   - Format: Your Vercel account slug (e.g., `my-username`)
   
   **Secret 3: VERCEL_PROJECT_ID**
   - Get from Vercel project settings → General

**Why?** This enables automatic redeployment whenever you push code updates to GitHub.

## Step 5: Record Your Loom Video

1. Go to https://loom.com and sign up (free account)
2. Start a new "Screen Recording"
3. Share your screen showing:
   - The **Live URL** in browser (or localhost:3000 if running locally)
   - Click through the **Pipeline** tab showing a compile run
   - Show the **Benchmark** tab with the 20/20 success metric
   - Briefly explain the **6 pipeline stages** (1-2 minutes each)
   - Show the JSON output demonstrating deterministic generation
4. Keep total length to **5-10 minutes**
5. Once done, click "Share" → **Copy link**
6. **Save this link** for the form submission

**Example outline:**
- Intro (30 sec): "This is AppForge, an LLM Application Compiler"
- Live demo (2 min): Run a compile, show output
- Benchmark evidence (1 min): Run all 20 tests, show success rate
- Architecture walkthrough (3 min): Briefly explain each stage
- Closing (1 min): Key design decisions (Zod contracts, deterministic, repair engine)

## Step 6: Submit the Form

1. Go to https://forms.gle/5mApv6YNKJPak1Ry6 (provided by the company)
2. Fill in:
   - **Live URL:** `https://<YOUR_PROJECT>.vercel.app`
   - **GitHub Repository URL:** `https://github.com/<YOUR_USERNAME>/appforge-project`
   - **Loom Video URL:** Paste the link from Step 5
   - **Any additional notes:** (Optional) Key accomplishments, design rationale
3. Click **Submit**

## Verification Checklist

Before submitting, verify all three are working:

- [ ] **Live URL loads** - Dashboard displays without errors
- [ ] **GitHub repo is public** - Anyone can view your code
- [ ] **Loom video plays** - Link is shareable and doesn't expire

## Troubleshooting

**Q: Build fails on Vercel with "npm run build" error**
A: Run `npm run build` locally to identify the issue. Most common: missing environment variables. Check `.env.example` if it exists.

**Q: Live URL shows 404 or deployment error**
A: Check Vercel deployments tab. Look at build logs for errors. Ensure Node.js version is 20+ in vercel.json.

**Q: GitHub Actions isn't auto-deploying**
A: Verify secrets are set correctly in repo Settings. Re-push a commit to trigger workflow.

**Q: Loom link expires or can't share**
A: Make sure you selected "Share with link" during recording. Create a new recording if needed.

## Support

If you encounter issues:
1. Check the [README.md](./README.md) architecture section
2. Test locally: `npm install && npm run dev`
3. Review the SUBMISSION_GUIDE.md for design details

Good luck with your submission! 🚀
