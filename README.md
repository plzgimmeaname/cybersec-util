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

### Save your results

Click **web page** or **json** under your score. Pick where to save it.
The web page opens in any browser. You can print it too.

### See what changed

The first time you run it, the app remembers how your computer looks.

Every time after that, it shows what is new or gone. For example, a new browser add-on.

If you made the change yourself, click **these are fine**.

### Stop the app

Close the app window. Or click on the command window and press `Ctrl + C`.

**Next time:** only do Step 2, Step 3 and Step 5.

---

## Help

- **It says "command not found":** close the window and open it again. Try again. If it still does not work, do Step 1 again.
- **You see red words after `npm install`:** you are in the wrong folder. Do Step 3 again.
- **Something says "unknown":** the app could not check that thing. It does not lower your score.
- **It takes a long time:** the update and old app checks use the internet. The first run can take a minute or two. After that it's faster.

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
- [x] Is virus protection on?
- [x] Does your screen lock when you walk away?
- [x] Are you using a normal account, not the boss account?
- [x] Are there open doors for the internet to get in?
- [x] Can other people control your computer from far away?
- [x] What apps start when your computer turns on?
- [x] Is your computer safe when it starts up?
- [x] Are there extra accounts you don't use?
- [x] Are your browser add-ons safe?
- [x] Save your results
- [x] What changed since last time?
- [x] Do you have old apps that are not safe?

---

## What it sends over the internet

Almost nothing. It only reads your computer.

- **Updates check:** asks Apple, Microsoft or your Linux system if updates are waiting. Same as clicking "check for updates".
- **Old apps check:** sends app names and version numbers (like "chrome 140") to **nvd.nist.gov**, a free U.S. government list of security holes. Nothing else is sent. Answers are saved for one day.

Your results stay on your computer. They are in this folder:

- **Mac:** `~/Library/Application Support/Security Checkup`
- **Windows:** `%APPDATA%\Security Checkup`
- **Linux:** `~/.config/Security Checkup`

Delete that folder to start fresh.
