# Security Checkup

This app checks if your computer is safe. If something is wrong, it tells you how to fix it.

It works on Mac, Windows and Linux. It only looks. It does not change anything.

---

## How to use it

### Step 1: Get Node.js (only the first time)

Node.js is a free helper that the app needs.

1. Go to **nodejs.org**
2. Click the big green button
3. Open the file you got. Click **Next** until it is done.

### Step 2: Open the command window

This is a window where you type commands.

- **Mac:** press `Cmd + Space`. Type **terminal**. Press Enter.
- **Windows:** press the Windows key. Type **powershell**. Press Enter.
- **Linux:** open the app called **Terminal**.

### Step 3: Go to this folder

Type `cd` and then a space. Drag this folder into the window. Press Enter.

### Step 4: Get the app ready (only the first time)

Type this and press Enter:

```bash
npm install
```

Wait until it stops. Yellow words are okay.

### Step 5: Start the app

Type this and press Enter:

```bash
npm start
```

The app opens. Click **run checkup**.

- Green means good
- Yellow means okay
- Red means you should fix it

Click on anything in the list to see how to fix it.

### Stop the app

Close the app window. Or click on the command window and press `Ctrl + C`.

**Next time:** only do Step 2, Step 3 and Step 5.

---

## Help

- **It says "command not found":** close the window and open it again. Try again. If it still does not work, do Step 1 again.
- **You see red words after `npm install`:** you are in the wrong folder. Do Step 3 again.
- **Something says "unknown":** the app could not check that thing. It does not lower your score.

---

## Make an app you can click on (you can skip this)

Type this and press Enter:

```bash
npm run dist
```

A new folder called **dist** shows up. Your app is in there.

Your computer may say it does not know who made the app. That is okay.

- **Mac:** right-click the app. Click **Open**. Click **Open** again.
- **Windows:** click **More info**. Then click **Run anyway**.

---

## What it checks

- [x] Are your files locked if someone steals your computer?
- [x] Is your wall against bad internet traffic turned on?
- [x] Is your computer up to date?
- [x] Does it update by itself?
- [ ] Is virus protection on?
- [ ] Does your screen lock when you walk away?
- [ ] Are you using a normal account, not the boss account?
- [ ] Are there open doors for the internet to get in?
- [ ] Can other people control your computer from far away?
- [ ] What apps start when your computer turns on?
- [ ] Is your computer safe when it starts up?
- [ ] Are there extra accounts you don't use?
- [ ] Are your browser add-ons safe?
- [ ] Save your results
- [ ] What changed since last time?
- [ ] Do you have old apps that are not safe?
