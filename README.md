# Security Checkup

A small desktop app that looks at **your own computer** and tells you, in plain English, what's safe and what to fix.
It works on **Mac, Windows and Linux**. It only **reads** your settings and never changes anything.

---

## What it checks right now

| Check | What it means |
|---|---|
| Disk encryption | If your laptop is stolen, can someone read your files? (FileVault / BitLocker / LUKS) |

More checks get added one step at a time. See [Roadmap](#roadmap) at the bottom.

---

## Option A: just run it (no coding)

> Ready-made downloads come later. For now, use **Option B**. It takes about 5 minutes.

---

## Option B: run it from this folder

You only do steps 1 and 2 **once**. After that, it's just step 3.

### 1. Install Node.js

Node.js is the free tool that runs this app.

1. Go to **https://nodejs.org**
2. Click the big green button that says **LTS**
3. Open the file you downloaded and click **Next / Continue** until it's done
4. Check it worked:
   - **Mac:** open the **Terminal** app (press `Cmd + Space`, type `terminal`, press Enter)
   - **Windows:** open **PowerShell** (press the Windows key, type `powershell`, press Enter)
   - **Linux:** open your **Terminal**
5. Type this and press Enter:

   ```bash
   node -v
   ```

   You should see a number like `v22.0.0`. Any number is fine.
   If it says "not found", close the window, open it again, and retry.

### 2. Get the app's parts

1. In the same Terminal / PowerShell window, go into this folder.
   Type `cd ` (with a space after it), then **drag this folder** into the window, then press Enter.
2. Type this and press Enter:

   ```bash
   npm install
   ```

   This downloads what the app needs. It can take a minute. Warnings in yellow are normal.

### 3. Start the app

```bash
npm start
```

The first time, it may download a little more (one time only). Then a window opens.

Click **run checkup**. You'll see:

- a **score** from 0 to 100 (green = good, yellow = okay, red = fix soon)
- a list of checks with a colored dot
- click any check to see **why it matters** and **how to fix it**

To close the app, just close the window. (In Terminal, `Ctrl + C` also stops it.)

---

## Make a real app you can double-click

This turns the project into a normal installer you can share.
Run it **on the same kind of computer** you're building for (build the Mac app on a Mac, etc.).

```bash
npm run dist
```

When it finishes, open the new **dist** folder:

| Computer | File you get | How to open it |
|---|---|---|
| Mac | `Security Checkup-x.x.x.dmg` | Double-click, drag the app into **Applications** |
| Windows | `Security Checkup Setup x.x.x.exe` | Double-click and follow the steps |
| Linux | `Security Checkup-x.x.x.AppImage` | Right-click → Properties → allow "run as program", then double-click |

**"Unknown developer" warning?** That's normal for apps that aren't paid-signed.

- **Mac:** right-click the app → **Open** → **Open**
- **Windows:** click **More info** → **Run anyway**

---

## Something went wrong?

| Problem | Fix |
|---|---|
| `npm: command not found` | Node.js isn't installed, or you need to close and reopen Terminal. Go back to step 1. |
| `npm install` shows red errors | Make sure you're inside this folder (step 2.1), then try again. |
| A check says **unknown** | The app couldn't read that setting. Click it to see why. It doesn't count against your score. |
| Window is blank | Close it and run `npm start` again. |

---

## How it's built (for the curious)

```
checks/          one file per check, written in plain yaml (no code)
src/engine.js    loads checks, runs them, scores the results
src/probes/      the actual "look at the computer" code, one file per os
src/main.js      opens the window
ui/              what you see (html, css, js)
```

To add a check, you add a `.yaml` file to `checks/` and a matching function in each `src/probes/` file.

---

## Roadmap

Built one step at a time. Each step adds one feature.

- [x] **Step 1:** app window, check engine, scoring, disk encryption
- [ ] Step 2: firewall
- [ ] Step 3: os updates current
- [ ] Step 4: automatic updates on
- [ ] Step 5: antivirus active
- [ ] Step 6: screen lock timeout
- [ ] Step 7: daily user is not admin
- [ ] Step 8: listening ports
- [ ] Step 9: remote access exposed
- [ ] Step 10: startup items
- [ ] Step 11: secure boot / system integrity
- [ ] Step 12: guest / unused accounts
- [ ] Step 13: browser extensions
- [ ] Step 14: save reports (html / json)
- [ ] Step 15: history and "what changed" (drift)
- [ ] Step 16: known-vulnerable software
