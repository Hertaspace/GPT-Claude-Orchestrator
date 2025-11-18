# Testing Guide - Updated Extension

## Changes Made

### 1. Dashboard Now Opens in Full Tab ✓
- **Before**: Clicking extension icon opened a small popup
- **After**: Clicking extension icon opens dashboard in a full browser tab
- **Implementation**:
  - Removed `default_popup` from `manifest.json`
  - Added `chrome.action.onClicked` listener in `background.js`
  - If dashboard tab already exists, it focuses it; otherwise creates new tab

### 2. Fixed Readiness Detection ✓
- **Before**: Extension showed "Please open ChatGPT and Claude" error even when both were open
- **After**: Correctly detects when content scripts connect and send READY messages
- **Implementation**:
  - Added support for both `chatgpt.com` and `chat.openai.com` domains
  - Enhanced logging to show exactly when READY messages are received
  - Content scripts send URL with READY message for verification
  - Background shows detailed readiness check in console

### 3. Enhanced Logging Throughout ✓
All components now use prefixed console logs:
- `[BG]` - Background service worker
- `[ChatGPT]` - ChatGPT content script
- `[Claude]` - Claude content script
- `[Dashboard]` - Dashboard page

---

## How to Test

### Step 1: Reload the Extension

1. Go to `chrome://extensions/`
2. Find "GPT-Claude Orchestrator"
3. Click the **refresh icon** (🔄) to reload the extension
4. Verify no errors appear

### Step 2: Open Required Tabs

1. **Open ChatGPT tab**:
   - Go to https://chat.openai.com (or https://chatgpt.com)
   - Log in if needed
   - Open DevTools (F12) on this tab
   - Check Console - you should see:
     ```
     [ChatGPT] Content script initializing on: https://chat.openai.com/...
     [ChatGPT] Page loaded, connecting to background...
     [ChatGPT] Connected to background
     [ChatGPT] ✓ Sent READY message
     ```

2. **Open Claude tab**:
   - Go to https://claude.ai
   - Log in if needed
   - Open DevTools (F12) on this tab
   - Check Console - you should see:
     ```
     [Claude] Content script initializing on: https://claude.ai/...
     [Claude] Page loaded, connecting to background...
     [Claude] Connected to background
     [Claude] ✓ Sent READY message
     ```

### Step 3: Check Background Service Worker

1. Go to `chrome://extensions/`
2. Find "GPT-Claude Orchestrator"
3. Click **"Service Worker"** link (under "Inspect views")
4. In the DevTools Console, you should see:
   ```
   [BG] Port connected: chatgpt
   [BG] ✓ ChatGPT is READY {type: 'READY', platform: 'chatgpt', url: '...'}
   [BG] Port connected: claude
   [BG] ✓ Claude is READY {type: 'READY', platform: 'claude', url: '...'}
   ```

**IMPORTANT**: Both platforms must show as READY in the background console!

### Step 4: Open Dashboard in Full Tab

1. Click the extension icon in your toolbar
2. **Verify**: A new full-size tab opens (NOT a popup)
3. If you click the icon again, it should focus the existing dashboard tab
4. Open DevTools (F12) on the dashboard tab
5. Check Console - you should see:
   ```
   [Dashboard] Connected to background
   [Dashboard] Ready to start sessions
   ```

### Step 5: Start a Discussion

1. In the dashboard tab, enter a test question:
   ```
   What is 2+2?
   ```

2. Click **"Start Discussion"**

3. **Check Dashboard Console**:
   ```
   [Dashboard] Starting new session with question: What is 2+2?
   [Dashboard] Sent START_SESSION message
   [Dashboard] Received message: SESSION_STATUS
   [Dashboard] Received message: LOG_MESSAGE
   ```

4. **Check Background Console** (chrome://extensions → Service Worker):
   ```
   [BG] startSession - Readiness check: {chatgpt: true, claude: true, ...}
   ```

   **If you see an error here**, it will show:
   ```
   [BG] ✗ Cannot start session: Please open ChatGPT and Claude...
   ```
   This means one or both content scripts didn't send READY.

5. **Check ChatGPT Tab Console**:
   ```
   [ChatGPT] Received message from background: SEND_PROMPT
   ```

6. **Check Claude Tab Console**:
   ```
   [Claude] Received message from background: SEND_PROMPT
   ```

7. **Watch the Dashboard**: You should see messages appearing in real-time

---

## Troubleshooting

### Issue: Dashboard still opens as popup

**Solution**:
1. Make sure you reloaded the extension (chrome://extensions → refresh button)
2. Verify `manifest.json` does NOT have `"default_popup": "dashboard.html"`
3. Try removing and re-adding the extension

### Issue: "Please open ChatGPT and Claude" error persists

**Diagnosis Steps**:

1. **Check Background Console** (chrome://extensions → Service Worker):
   - Do you see `[BG] Port connected: chatgpt`?
   - Do you see `[BG] ✓ ChatGPT is READY`?
   - Do you see `[BG] Port connected: claude`?
   - Do you see `[BG] ✓ Claude is READY`?

2. **Check ChatGPT Tab Console**:
   - Do you see `[ChatGPT] Content script initializing`?
   - If NO: Content script didn't load
     - Verify URL is https://chat.openai.com/* or https://chatgpt.com/*
     - Check `manifest.json` has both URLs in `content_scripts.matches`
     - Reload the extension
     - Refresh the ChatGPT tab

3. **Check Claude Tab Console**:
   - Do you see `[Claude] Content script initializing`?
   - If NO: Content script didn't load
     - Verify URL is https://claude.ai/*
     - Reload the extension
     - Refresh the Claude tab

4. **Timing Issue**:
   - Content scripts might connect AFTER you open the dashboard
   - Solution: Open ChatGPT and Claude tabs FIRST, wait 2-3 seconds for READY messages, THEN open dashboard

### Issue: Content script not loading

**Check**:
1. Extension has `host_permissions` for the domain
2. `content_scripts.matches` includes the URL pattern
3. Try hard refresh of the page (Ctrl+Shift+R)
4. Check browser console for any extension errors

### Issue: Messages not being detected

**Diagnosis**:
1. Check if prompts are actually being sent to the web UIs
2. Look in content script console for "NEW_MESSAGE" logs
3. DOM selectors might need updating if ChatGPT/Claude changed their UI
4. Check if you're actually logged in to both services

---

## Console Log Examples

### Successful Flow

**Background Console**:
```
GPT-Claude Orchestrator background service worker loaded
[BG] Port connected: chatgpt
[BG] ✓ ChatGPT is READY {type: 'READY', platform: 'chatgpt', url: 'https://chat.openai.com/'}
[BG] Port connected: claude
[BG] ✓ Claude is READY {type: 'READY', platform: 'claude', url: 'https://claude.ai/'}
[BG] Port connected: dashboard
[BG] startSession - Readiness check: {chatgpt: true, claude: true, chatgptPort: true, claudePort: true}
```

**ChatGPT Tab Console**:
```
[ChatGPT] Content script initializing on: https://chat.openai.com/
[ChatGPT] Page loaded, connecting to background...
[ChatGPT] Connected to background
[ChatGPT] ✓ Sent READY message {type: 'READY', platform: 'chatgpt', url: '...'}
[ChatGPT] Received message from background: SEND_PROMPT
```

**Claude Tab Console**:
```
[Claude] Content script initializing on: https://claude.ai/
[Claude] Page loaded, connecting to background...
[Claude] Connected to background
[Claude] ✓ Sent READY message {type: 'READY', platform: 'claude', url: '...'}
[Claude] Received message from background: SEND_PROMPT
```

**Dashboard Tab Console**:
```
[Dashboard] Connected to background
[Dashboard] Ready to start sessions
[Dashboard] Starting new session with question: What is 2+2?
[Dashboard] Sent START_SESSION message
[Dashboard] Received message: LOG_MESSAGE
```

---

## Files Modified

1. **manifest.json**:
   - Removed `"default_popup": "dashboard.html"`
   - Added `"https://chatgpt.com/*"` to host_permissions and content_scripts.matches

2. **background.js**:
   - Added `chrome.action.onClicked` listener to open dashboard in tab
   - Enhanced logging with `[BG]` prefix
   - Added detailed readiness check logging in `startSession()`

3. **chatgpt_content.js**:
   - Enhanced logging with `[ChatGPT]` prefix
   - READY message now includes URL
   - Better connection/disconnection logging

4. **claude_content.js**:
   - Enhanced logging with `[Claude]` prefix
   - READY message now includes URL
   - Better connection/disconnection logging

5. **dashboard.js**:
   - Enhanced logging with `[Dashboard]` prefix
   - Better START_SESSION logging

---

## Next Steps

Once testing is successful:

1. ✓ Dashboard opens in full tab (not popup)
2. ✓ Both ChatGPT and Claude show READY in background console
3. ✓ Sessions start without "Please open..." error
4. ✓ Messages flow between all components

The extension should now work correctly!

If you still see issues, provide:
- Console logs from Background, ChatGPT, Claude, and Dashboard
- Screenshots of any errors
- The exact URLs you're using for ChatGPT and Claude
