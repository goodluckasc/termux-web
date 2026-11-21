# Termux Web

A Termux-style terminal simulator that runs entirely in the browser. It includes a virtual filesystem, ~50 commands, multi-session support, tab completion, command history, an in-terminal editor, and simulated `pkg` installs that unlock commands like `python`, `git`, and `nmap`.

> This is a front-end simulation only. No real shell commands are executed and nothing is downloaded or installed on the host machine.

## Deploy to Vercel

This is a static site, so no build command, framework, or environment variables are required.

### Option 1: Drag and drop

1. Go to [vercel.com/new](https://vercel.com/new).
2. Drag the project folder onto the import area.
3. Click **Deploy**.

### Option 2: Git repository

1. Push this folder to GitHub, GitLab, or Bitbucket.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Use these settings (they should be detected automatically):
   - **Framework Preset:** Other
   - **Root Directory:** `./`
   - **Build Command:** *(leave empty)*
   - **Output Directory:** *(leave empty / `.`)*
4. Click **Deploy**.

`vercel.json` adds clean URLs and a few basic security headers.

## Run locally

Just open `index.html` in a browser. Alternatively, serve it with:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Quick start in the terminal

```sh
help
pkg list-all
pkg install python git nmap
python -c "print(2+3)"
git init
git status
nmap -sV example.com
```

Installed packages are saved in the browser's `localStorage`, so they survive page reloads. They are specific to each browser/profile.
