# Auto-Injection Feature

## Problem

Previously, when the extension was installed or refreshed:
- Content scripts would NOT automatically inject into already-open ChatGPT/Claude tabs
- Users had to manually refresh those tabs (F5) to make them work
- This was frustrating and not intuitive

## Solution

The extension now **automatically injects content scripts** into open tabs in two scenarios:

### 1. On Extension Startup
When the background service worker starts (extension installed/refreshed):
- Waits 1 second for initialization
- Searches for all open ChatGPT and Claude tabs
- Automatically injects scripts into them
- Logs the process in background console

### 2. When Opening Dashboard
When you click the extension icon to open the dashboard:
- Triggers auto-injection before opening dashboard
- Ensures tabs are ready by the time dashboard loads
- Makes the connection status immediately accurate

## How It Works

```javascript
1. Find all tabs matching ChatGPT/Claude URLs
2. For each tab:
   - Check if tab is fully loaded (status === 'complete')
   - Inject html-to-markdown.js
   - Inject platform content script (chatgpt_content.js or claude_content.js)
   - Handle errors gracefully (script might already be injected)
3. Log results to console
```

## What You'll See

### In Background Console

When auto-injection runs:
```
[BG] 🔧 Auto-injecting content scripts into open tabs...
[BG] Found 1 ChatGPT tab(s)
[BG] Injecting into ChatGPT tab 123: https://chat.openai.com/...
[BG] ✓ Successfully injected into ChatGPT tab 123
[BG] Found 1 Claude tab(s)
[BG] Injecting into Claude tab 456: https://claude.ai/...
[BG] ✓ Successfully injected into Claude tab 456
[BG] ✓ Auto-injection complete
[BG] Auto-injection triggered before opening dashboard
```

### In ChatGPT/Claude Console

You'll see the normal connection logs:
```
[CS chatgpt] script loaded at https://chat.openai.com/...
[CS chatgpt] Connecting to background...
[CS chatgpt] ✓ Connected to background
[CS chatgpt] ✓ Sent READY message
```

## Scenarios

### Scenario A: Fresh Extension Install
1. Install extension
2. ChatGPT and Claude tabs already open
3. **Before:** Tabs not ready, need to refresh
4. **After:** Auto-injection runs, tabs ready automatically ✓

### Scenario B: Extension Refresh
1. Make changes to extension code
2. Click refresh button in chrome://extensions/
3. ChatGPT and Claude tabs still open
4. **Before:** Need to refresh tabs manually
5. **After:** Auto-injection runs, tabs ready automatically ✓

### Scenario C: Opening Dashboard Later
1. Extension running, tabs open
2. You click extension icon to open dashboard
3. **Before:** If tabs weren't refreshed, they show as not ready
4. **After:** Auto-injection runs before dashboard opens, tabs ready ✓

### Scenario D: New Tab Opened
1. Extension already running
2. You open a NEW ChatGPT or Claude tab
3. Content script auto-injects normally (via manifest.json)
4. No manual action needed ✓

## Error Handling

The auto-injection is designed to be robust:

- **If script already injected:** Error is caught and logged, but ignored (no harm done)
- **If tab not ready:** Skips that tab (logs "not complete")
- **If URL doesn't match:** Tab is not selected for injection
- **If permission denied:** Error logged but doesn't break extension

Example error handling:
```
[BG] Could not inject into ChatGPT tab 123: <error message>
```

This is normal if:
- Script was already injected
- Tab is still loading
- Tab has restricted permissions

## Testing

### Test 1: Fresh Install
1. Open ChatGPT and Claude tabs
2. Install extension
3. Wait 2 seconds
4. Check background console - should see auto-injection logs
5. Click extension icon - dashboard should show both platforms ready

### Test 2: Extension Refresh
1. ChatGPT and Claude tabs already open
2. Go to chrome://extensions/
3. Click refresh button on extension
4. Check background console - should see auto-injection logs
5. Click extension icon - platforms should be ready immediately

### Test 3: Click Extension Icon
1. ChatGPT and Claude tabs open
2. Extension already running
3. Click extension icon
4. Check background console - should see "Auto-injection triggered"
5. Dashboard should show platforms ready

### Test 4: Verify No Double Injection
1. Open ChatGPT tab (auto-injects via manifest)
2. Click extension icon (triggers manual injection)
3. Check ChatGPT console - should see connection logs only once
4. Or might see twice, but that's harmless (reconnection logic handles it)

## Benefits

✅ **No manual refresh needed** - Tabs work immediately after extension install/refresh
✅ **Better UX** - Users don't need to know about the refresh requirement
✅ **Faster workflow** - Dashboard shows ready status immediately
✅ **Robust** - Works in all scenarios (install, refresh, click icon)
✅ **Safe** - Graceful error handling, no crashes

## Technical Details

**Permissions Required:**
- `scripting` - Already in manifest.json
- `tabs` - Already in manifest.json
- `host_permissions` - Already configured for ChatGPT and Claude

**API Used:**
- `chrome.tabs.query()` - Find matching tabs
- `chrome.scripting.executeScript()` - Inject scripts programmatically

**Timing:**
- Startup: 1 second delay to allow initialization
- Icon click: Immediate injection
- Both: Asynchronous, non-blocking

**Files Injected:**
1. `html-to-markdown.js` - First (dependency)
2. `chatgpt_content.js` or `claude_content.js` - Second

**Injection Order Matters:**
The HTML to Markdown converter must be injected before the content scripts, since the content scripts depend on `window.htmlToMarkdown` being available.

## Debugging

If auto-injection doesn't work:

1. **Check Background Console:**
   ```
   chrome://extensions/ → Service Worker
   Look for: [BG] 🔧 Auto-injecting content scripts...
   ```

2. **Verify Tabs Were Found:**
   ```
   [BG] Found 0 ChatGPT tab(s)  ← Problem: No tabs found
   [BG] Found 1 ChatGPT tab(s)  ← Good: Tab found
   ```

3. **Check Injection Success:**
   ```
   [BG] ✓ Successfully injected into ChatGPT tab 123  ← Success
   [BG] Could not inject into ChatGPT tab 123: ...    ← Error
   ```

4. **Check Platform Console:**
   - Open ChatGPT/Claude tab
   - Press F12 → Console
   - Look for: `[CS chatgpt] script loaded`
   - If present: Injection worked
   - If missing: Injection failed or hasn't run yet

5. **Manual Injection Test:**
   In background console, run:
   ```javascript
   injectContentScripts()
   ```
   This manually triggers injection - check logs

## Limitations

- **Only works on complete tabs** - Tabs still loading are skipped
- **Doesn't work on restricted pages** - Some Chrome pages block script injection
- **Service Worker lifecycle** - If Service Worker goes idle, auto-injection on startup won't run until it wakes up

## Future Improvements

Potential enhancements:
- Inject when tab finishes loading (listen to `chrome.tabs.onUpdated`)
- Visual indicator in dashboard when auto-injection is running
- Retry logic if injection fails
- Track injection status per tab to avoid redundant attempts
