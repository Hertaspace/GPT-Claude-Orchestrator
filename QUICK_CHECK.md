# Quick Connection Check

## Step 1: Open All Consoles

1. **Background Console:**
   - Go to `chrome://extensions/`
   - Find "GPT-Claude Orchestrator"
   - Click "Service Worker" (blue link)
   - Keep this window open

2. **ChatGPT Console:**
   - Open https://chat.openai.com
   - Press F12 → Console tab
   - Keep this window open

3. **Claude Console:**
   - Open https://claude.ai
   - Press F12 → Console tab
   - Keep this window open

4. **Dashboard:**
   - Click extension icon to open dashboard
   - Press F12 → Console tab
   - Click "🔧 Connection Debug Info" to expand debug panel

## Step 2: Wait 1 Minute and Observe

Watch all 4 console windows for 1 minute. Note:

### Expected Behavior (Normal):

**Background console** should show every 5 seconds:
```
[BG] ⏰ Status check: {chatgptReady: true, claudeReady: true, ...}
```

**ChatGPT/Claude consoles** might show:
```
[CS chatgpt] ✗ Port disconnected from background
[CS chatgpt] Will attempt to reconnect in 2 seconds...
[CS chatgpt] Attempting to reconnect...
[CS chatgpt] ✓ Connected to background
[CS chatgpt] ✓ Sent READY message
```
**This is NORMAL** - Chrome Service Workers go idle and disconnect. The reconnection should succeed within 2-3 seconds.

**Dashboard debug panel** should show:
```
Dashboard → Background: ✓ Connected
ChatGPT Status: ✓ Ready (Just now or Xs ago)
Claude Status: ✓ Ready (Just now or Xs ago)
Port Active: ✓ Active
```

### Problem Scenarios:

#### Scenario A: Reconnection Fails
```
[CS chatgpt] ✗ Port disconnected from background
[CS chatgpt] Will attempt to reconnect in 2 seconds...
[CS chatgpt] Attempting to reconnect...
[CS chatgpt] ✗ Failed to connect to background: Error: Extension context invalidated
```

**Cause:** Extension was reloaded/disabled
**Solution:** Refresh all tabs (ChatGPT, Claude, Dashboard)

#### Scenario B: Repeated Disconnections (Loop)
```
[CS chatgpt] ✗ Port disconnected from background
[CS chatgpt] Attempting to reconnect...
[CS chatgpt] ✓ Connected to background
[2 seconds later]
[CS chatgpt] ✗ Port disconnected from background
[CS chatgpt] Attempting to reconnect...
[repeats continuously]
```

**Cause:** Service Worker is crashing or restarting repeatedly
**Solution:** Check background console for errors, extension might need debugging

#### Scenario C: No Reconnection Attempt
```
[CS chatgpt] ✗ Port disconnected from background
[nothing else happens]
```

**Cause:** Content script stopped running
**Solution:** Refresh the tab

#### Scenario D: Debug Panel Shows Disconnected but Consoles Show Connected
```
Debug Panel: ChatGPT Status: ✗ Disconnected (last seen 30s ago)
ChatGPT Console: [CS chatgpt] ✓ Connected to background
Background Console: [BG] ⏰ Status check: {chatgptReady: true, ...}
```

**Cause:** Dashboard not receiving PLATFORM_READY updates
**Solution:** Check background console for errors in message routing

## Step 3: Test Functionality

1. Enter a simple question in the dashboard: "What is 2+2?"
2. Click "Start Discussion"
3. Watch all consoles for activity

### Expected:
- Background console shows: `[BG] ▶ START_SESSION called for: session_...`
- ChatGPT console shows: `[CS chatgpt] ← Received message from background: {type: "SEND_PROMPT"}`
- Claude console shows: `[CS claude] ← Received message from background: {type: "SEND_PROMPT"}`
- Dashboard shows: "Sending initial prompts..."

### If you see error:
- `[BG] ✗ Cannot start session - platforms not ready`

  **Check debug panel:** Which platform shows ✗ Disconnected?

## Step 4: Report Results

When reporting issues, please provide:

1. **Screenshot of debug panel** showing all 5 status rows
2. **Last 20 lines from each console:**
   - Background console
   - ChatGPT console
   - Claude console
   - Dashboard console
3. **Specific error message** you're seeing
4. **What you were trying to do** when the error occurred

## Common False Alarms

These messages LOOK like errors but are actually NORMAL:

✅ **NORMAL (NOT A PROBLEM):**
```
[CS chatgpt] ✗ Port disconnected from background
[CS chatgpt] Will attempt to reconnect in 2 seconds...
[CS chatgpt] Attempting to reconnect...
[CS chatgpt] ✓ Connected to background
```
This is Chrome's Service Worker going idle. Reconnection succeeds = no problem.

✅ **NORMAL (NOT A PROBLEM):**
```
[BG] ⏰ Status check: {chatgptReady: true, claudeReady: true, ...}
```
This is periodic monitoring. It runs every 5 seconds when any component is connected.

❌ **ACTUAL PROBLEM:**
```
[BG] ✗ Cannot start session - platforms not ready: Please open ChatGPT and Claude...
```
This means the platforms are genuinely not ready. Check debug panel to see why.

❌ **ACTUAL PROBLEM:**
```
[CS chatgpt] ✗ Failed to connect to background: Error: Extension context invalidated
```
Extension was reloaded. Refresh all tabs.

❌ **ACTUAL PROBLEM:**
```
[CS chatgpt] ✗ Port disconnected from background
[30 seconds pass, no reconnection attempt]
```
Content script stopped running. Refresh the tab.
