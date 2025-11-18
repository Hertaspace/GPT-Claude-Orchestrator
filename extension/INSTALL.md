# Quick Installation Guide

## Step 1: Prepare the Extension

You already have the extension files in the `extension` folder. The structure should look like this:

```
extension/
├── manifest.json
├── background.js
├── chatgpt_content.js
├── claude_content.js
├── dashboard.html
├── dashboard.js
├── icon.svg
├── README.md
├── ICONS.md
└── INSTALL.md (this file)
```

## Step 2: Load Extension in Chrome

1. **Open Chrome Extensions Page**
   - Open Google Chrome (or Edge, Brave, etc.)
   - Navigate to: `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Look for "Developer mode" toggle in the top-right corner
   - Click to enable it

3. **Load the Extension**
   - Click "Load unpacked" button (appears after enabling Developer mode)
   - Navigate to and select the `extension` folder
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "GPT-Claude Orchestrator" in your extensions list
   - The extension icon should appear in your toolbar
   - If you don't see the icon, click the puzzle piece (🧩) and pin it

## Step 3: Prepare Your Browser

1. **Open ChatGPT**
   - Open a new tab
   - Go to: https://chat.openai.com
   - Log in if not already logged in
   - You should see the chat interface

2. **Open Claude**
   - Open another new tab
   - Go to: https://claude.ai
   - Log in if not already logged in
   - You should see the chat interface

3. **Keep Both Tabs Open**
   - Don't close these tabs while using the extension
   - The extension needs both to be open to work

## Step 4: Test the Extension

1. **Open Dashboard**
   - Click the extension icon in your toolbar
   - The dashboard popup should appear

2. **Check Status**
   - Look at the bottom of the dashboard
   - It should say "Connected and ready" with a green dot
   - If it shows an error, try:
     - Refreshing the ChatGPT and Claude tabs
     - Closing and reopening the dashboard

3. **Run a Test**
   - Enter a simple question like: "What is 2+2?"
   - Click "Start Discussion"
   - Watch the messages appear in real-time

## Troubleshooting

### Extension Won't Load

**Error: "Manifest file is missing or unreadable"**
- Make sure you selected the `extension` folder, not a parent folder
- Check that `manifest.json` exists in the folder

**Error: "Manifest version 3 is required"**
- Your browser may be outdated
- Update Chrome to the latest version

### Dashboard Shows "Disconnected"

1. **Reload the Extension**
   - Go to `chrome://extensions/`
   - Find "GPT-Claude Orchestrator"
   - Click the refresh icon (🔄)

2. **Check Console for Errors**
   - Right-click the extension icon → "Inspect popup"
   - Look for errors in the Console tab
   - Also check the background service worker:
     - Go to `chrome://extensions/`
     - Click "Service Worker" under the extension
     - Check the Console

### No Messages Detected

1. **Refresh ChatGPT/Claude Tabs**
   - The content scripts may not have loaded
   - Refresh both tabs

2. **Check Content Script Injection**
   - Open DevTools on ChatGPT tab (F12)
   - Go to Console tab
   - You should see: "ChatGPT content script initializing..."
   - If not, refresh the page

3. **Verify Login**
   - Make sure you're actually logged in
   - Try sending a manual message to ChatGPT/Claude
   - Then try the extension again

### Messages Not Being Sent

1. **Check Selectors**
   - ChatGPT and Claude frequently update their UIs
   - The DOM selectors in content scripts may need updating
   - See README.md for details on updating selectors

2. **Manual Test**
   - Open DevTools console on ChatGPT page
   - Type: `document.querySelector('textarea')`
   - If null, the selector needs updating

## Next Steps

Once everything is working:

1. **Try a Real Question**
   - Ask something that benefits from multiple perspectives
   - Examples:
     - "Explain quantum computing in simple terms"
     - "What are the pros and cons of remote work?"
     - "Help me debug this code: [paste code]"

2. **Customize Settings**
   - Open `background.js`
   - Modify the `CONFIG` object to adjust:
     - Maximum rounds
     - Timeouts
     - Status markers

3. **Read Full Documentation**
   - Check `README.md` for detailed information
   - Learn about the discussion protocol
   - Understand the technical architecture

## Uninstalling

To remove the extension:

1. Go to `chrome://extensions/`
2. Find "GPT-Claude Orchestrator"
3. Click "Remove"
4. Confirm removal

## Getting Help

If you encounter issues:

1. Check the Troubleshooting section above
2. Read the full README.md
3. Check browser console logs for errors
4. Ensure you're using the latest version of Chrome

## System Requirements

- **Browser**: Chrome 88+, Edge 88+, or other Chromium-based browsers
- **Accounts**: Active ChatGPT and Claude accounts
- **Internet**: Stable internet connection
- **OS**: Windows, macOS, or Linux (any OS that supports Chrome)

---

Enjoy orchestrating discussions between ChatGPT and Claude!
