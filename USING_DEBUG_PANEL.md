# Using the Debug Panel

The dashboard now includes a **real-time connection debug panel** that makes it easy to identify platform connection issues without checking browser console logs.

## 🎯 Quick Start

1. **Open the dashboard** (click the extension icon)
2. **Click "🔧 Connection Debug Info"** to expand the debug panel
3. **Check the status indicators** - green = connected, red = disconnected, yellow = waiting

## 📊 What Each Row Shows

### Dashboard → Background
- **✓ Connected**: Dashboard is successfully connected to the background service worker
- **✗ Disconnected**: Dashboard lost connection to background (extension may need refresh)

### ChatGPT Status
- **✓ Ready (Xs ago)**: ChatGPT content script is connected and ready
- **✗ Disconnected (last seen Xs ago)**: ChatGPT was connected but disconnected (tab may have been closed or extension reloaded)
- **⏳ Waiting for connection...**: ChatGPT has never connected (tab not open or content script not loaded)

### Claude Status
- **✓ Ready (Xs ago)**: Claude content script is connected and ready
- **✗ Disconnected (last seen Xs ago)**: Claude was connected but disconnected
- **⏳ Waiting for connection...**: Claude has never connected

### Last Message
Shows the most recent message type received and when (helps verify communication is working)

### Port Active
- **✓ Active**: Dashboard port is active
- **✗ Inactive**: Dashboard port is disconnected

## 🔍 Common Scenarios

### Scenario 1: Both platforms showing "Waiting for connection"
**What it means:** ChatGPT and/or Claude tabs are not open, or content scripts failed to inject

**Solution:**
1. Open ChatGPT at https://chat.openai.com or https://chatgpt.com
2. Open Claude at https://claude.ai
3. Wait 2-3 seconds
4. Check if status changes to "✓ Ready"

**If still waiting:**
- Refresh ChatGPT/Claude tabs (F5)
- Check browser console on those tabs for errors
- Verify you're on the correct URLs (not subdomains)

### Scenario 2: "Disconnected (last seen Xs ago)"
**What it means:** Platform was connected but the port disconnected (Service Worker went idle or tab was closed)

**Solution:**
1. Check if ChatGPT/Claude tabs are still open
2. If tabs are open, the content scripts should auto-reconnect within 2-3 seconds
3. Watch the timestamp - if it updates to "Just now", reconnection succeeded
4. If reconnection doesn't happen, refresh the platform tab

### Scenario 3: Dashboard shows "Disconnected"
**What it means:** Dashboard lost connection to background service worker

**Solution:**
1. Close and reopen the dashboard (click extension icon)
2. If that doesn't work, refresh the extension at chrome://extensions/

### Scenario 4: "Last Message: None received yet"
**What it means:** No messages have been received from background at all

**Solution:**
- This is normal if you just opened the dashboard
- After 1-2 seconds, you should see "Last Message: PLATFORM_READY"
- If it stays "None" for more than 5 seconds, dashboard-background connection may be broken

## 🔄 Auto-Refresh

The debug panel automatically updates:
- **Every 5 seconds** (when expanded) to show current timestamps
- **Whenever a message is received** from the background
- **On connection/disconnection events**

## 💡 Pro Tips

1. **Keep the panel expanded** while debugging connection issues
2. **Watch the timestamps** - if they're updating, communication is working
3. **"Just now" or "Xs ago"** tells you when the last update was received
4. **Compare with browser console** - debug panel should match console logs
5. **If both platforms are ✓ Ready** but "Start Discussion" still shows error, check browser console for detailed logs

## 🐛 Troubleshooting

**Debug panel shows "✓ Ready" for both but still getting "platforms not ready" error:**
- The background service worker may have a different state than dashboard sees
- Check background console (chrome://extensions/ → Service Worker)
- Look for the periodic "[BG] ⏰ Status check" log
- Compare chatgptReady/claudeReady values with what dashboard shows

**Debug panel not updating:**
- Collapse and re-expand the panel to force refresh
- Check if "Last Message" timestamp is updating
- If completely frozen, refresh the dashboard

**Timestamps showing "Never":**
- Platform has never connected since dashboard was opened
- This is normal for platforms that haven't been opened yet
- Once platform connects, timestamp will change to "Just now"

## 📝 Using with Diagnosis Guide

Combine the debug panel with [DIAGNOSIS_PLATFORMS_NOT_READY.md](./DIAGNOSIS_PLATFORMS_NOT_READY.md):

1. **Check debug panel** for quick status overview
2. **If issue found**, open browser console for detailed logs
3. **Follow diagnosis guide** for step-by-step troubleshooting

The debug panel gives you the **what** (which platform is disconnected), and the console logs give you the **why** (what error occurred).
