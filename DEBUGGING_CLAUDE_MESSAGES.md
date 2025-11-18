# Debugging Claude Message Detection

The extension now has comprehensive logging to track every step of Claude message detection and processing.

## 🧪 Testing Steps

### 1. Refresh Extension
```
1. Open chrome://extensions/
2. Find "GPT-Claude Orchestrator"
3. Click 🔄 Refresh button
4. Wait 2 seconds
```

### 2. Open Background Console
```
1. chrome://extensions/
2. "GPT-Claude Orchestrator" → Click "Service Worker" (blue link)
3. Keep this console window open
```

Expected logs:
```
[BG] Service worker started
[BG] ✅ GPT-Claude Orchestrator background service worker loaded
[BG] Initial state: chatgptReady=false, claudeReady=false
```

### 3. Open ChatGPT
```
1. Open https://chat.openai.com or https://chatgpt.com
2. Press F12 → Console tab
```

Expected logs in ChatGPT console:
```
[CS chatgpt] script loaded at https://chat.openai.com/...
[CS chatgpt] connected to background
[CS chatgpt] sent READY
```

Expected logs in Background console:
```
[BG] onConnect from port: chatgpt
[BG] Port connected: chatgpt
[BG] ChatGPT port attached
[BG] Message from chatgpt: READY
[BG] READY received from chatgpt, URL: ...
[BG] Platforms now: {chatgptReady: true, claudeReady: false}
```

### 4. Open Claude
```
1. Open https://claude.ai
2. Press F12 → Console tab
```

**CRITICAL:** Keep Claude console open and watch for logs!

Expected logs in Claude console:
```
[CS claude] script loaded at https://claude.ai/...
[CS claude] connected to background
[CS claude] sent READY
[CS claude] Calling initialize()...
[CS claude] ===== Initializing DOM observers =====
[CS claude] Document ready state: ...
[CS claude] Document ready, starting observer...
Claude observer started
[CS claude] ===== Initial message count: 0 =====
```

Expected logs in Background console:
```
[BG] onConnect from port: claude
[BG] Port connected: claude
[BG] Claude port attached
[BG] Message from claude: READY
[BG] READY received from claude, URL: ...
[BG] Platforms now: {chatgptReady: true, claudeReady: true}
```

### 5. Open Dashboard & Start Discussion
```
1. Click extension icon
2. Enter question: "What is 2+2?"
3. Press Enter
```

### 6. Watch Background Console for Prompts
When you press Enter, you should see:
```
[BG] 📨 Received START_SESSION from dashboard
[BG] Created new session: session_xxxxx
[BG] ▶ START_SESSION called for: session_xxxxx
[BG] Readiness check: {chatgptReady: true, claudeReady: true, chatgptPort: true, claudePort: true}
[BG] ✓ Both platforms ready, starting session session_xxxxx
[BG] → Sending SEND_PROMPT to chatgpt for session session_xxxxx
[BG] → Sending SEND_PROMPT to claude for session session_xxxxx
```

### 7. Watch Claude Console for SEND_PROMPT
**THIS IS CRITICAL!** In Claude console, you MUST see:
```
[CS claude] ← Received message from background: {type: "SEND_PROMPT", sessionId: "session_xxxxx", text: "..."}
[CS claude] SEND_PROMPT command received
[CS claude] SessionId: session_xxxxx
[CS claude] Text preview: You are Claude...
[CS claude] sendPrompt called with sessionId: session_xxxxx
[CS claude] Prompt text length: ...
[CS claude] Set currentSessionId to: session_xxxxx
[CS claude] ✓ Found input element: DIV (or TEXTAREA)
[CS claude] ✓ Found submit button, clicking...
[CS claude] Prompt sent, resetting isProcessing flag
```

**If you DON'T see these logs** → The problem is that Claude content script is not receiving SEND_PROMPT from background.

### 8. Watch Claude Console for Message Detection
After Claude starts responding, you should see (every ~1 second):
```
[CS claude] checkForNewMessages - lastMessageCount: 0
[CS claude] getClaudeMessages called
[CS claude] Found elements with data-is-streaming: X
[CS claude] Non-streaming messages: Y
[CS claude] Current message count: Y
```

When Claude finishes typing:
```
[CS claude] checkForNewMessages - lastMessageCount: 0
[CS claude] getClaudeMessages called
[CS claude] Found elements with data-is-streaming: 1
[CS claude] Non-streaming messages: 1
[CS claude] Current message count: 1
[CS claude] NEW MESSAGE DETECTED! Previous: 0 Current: 1
[CS claude] Last message data-is-streaming: false
[CS claude] Extracting text from element: ...
[CS claude] Extracted text length: ...
[CS claude] Extracted text preview: ...
[CS claude] ✓ Complete message ready, length: ...
[CS claude] Message preview: ...
[CS claude] Sending NEW_MESSAGE to background for session: session_xxxxx
[CS claude] ✓ NEW_MESSAGE sent successfully
```

**If message detection stops at "Still streaming - will wait":**
- The `data-is-streaming` attribute is still "true"
- OR the stop button is still visible
- Wait a few more seconds

**If you see "No new messages detected":**
- The selectors are not finding Claude's messages
- Check the DOM structure in Elements tab
- Look for elements with `data-is-streaming` attribute

### 9. Watch Background Console for Claude Message
When Claude's NEW_MESSAGE arrives, Background console should show:
```
[BG] ========== NEW_MESSAGE from claude ==========
[BG] Provided sessionId: session_xxxxx
[BG] Content length: ...
[BG] Content preview: ...
[BG] ✓ Found session by provided sessionId: session_xxxxx
[BG] ✓ Processing message for session session_xxxxx
[BG] Session details: round=0, status=starting
[BG] ✓ Cleared timeout for claude
[BG] Removed claude from waitingFor (was waiting: true)
[BG] Parsed state from claude: READY (or DISCUSS or UNKNOWN)
[BG] Stripped content length: ...
[BG] ✓ Updated lastClaudeAnswer and lastClaudeState
[BG] Logging message to dashboard: role=claude, round=0
[BG] Logging message: claude in round 0 for session session_xxxxx
[BG] Still waiting for: [chatgpt] (or [] if ChatGPT already responded)
```

**If you DON'T see "NEW_MESSAGE from claude":**
- Go back to step 8
- Check Claude console - was NEW_MESSAGE sent?
- If sent but not received → there's a port disconnection issue

**If you see "NO ACTIVE SESSION FOUND":**
- The sessionId from Claude doesn't match
- Check that `currentSessionId` was set in step 7

### 10. When Both Respond
When BOTH ChatGPT and Claude have responded, Background console should show:
```
[BG] Still waiting for: []
[BG] ✓ Both platforms responded, processing round...
[BG] 🔄 processRound for session session_xxxxx, status: starting, round: 0
[BG] Decision point: bothReady=true, maxRoundsReached=false
[BG] States: GPT=READY, Claude=READY
[BG] 📝 Moving to summary phase
```

## 🔍 Troubleshooting

### Problem: Claude console shows NO logs after "sent READY"
**Diagnosis:** Content script crashed or didn't initialize
**Solution:**
- Refresh Claude tab (F5)
- Check for red errors in Claude console
- Check manifest.json has correct matches for claude.ai

### Problem: Claude console shows "Skipping check - isProcessing = true"
**Diagnosis:** `isProcessing` flag stuck
**Solution:**
- This is normal during prompt sending
- Should reset after 2 seconds
- If stuck permanently, refresh Claude tab

### Problem: "No new messages detected" continuously
**Diagnosis:** Message selectors not matching DOM
**Solution:**
1. In Claude tab, press F12 → Elements tab
2. Find Claude's response message element
3. Check if it has `data-is-streaming` attribute
4. If not, find what class/attribute it DOES have
5. Update SELECTORS in claude_content.js

### Problem: "Message text is empty, skipping"
**Diagnosis:** Text extraction failed
**Solution:**
- The `extractMessageText()` function can't find text
- Inspect the message element in Elements tab
- Text might be in a nested element

### Problem: Background shows "NO ACTIVE SESSION FOUND"
**Diagnosis:** SessionId mismatch
**Solution:**
- Check that Claude received SEND_PROMPT with sessionId
- Check that `currentSessionId` was set
- Verify sessionId matches between SEND_PROMPT and NEW_MESSAGE

### Problem: Dashboard shows only ChatGPT, not Claude
**Diagnosis:** Claude's NEW_MESSAGE never reached background OR was received but not forwarded to dashboard
**Solution:**
- Check Background logs for "NEW_MESSAGE from claude"
- Check Background logs for "Logging message to dashboard: role=claude"
- If message was logged but not displayed, check Dashboard console

## ✅ Success Criteria

The extension is working correctly when:

1. ✅ Claude console shows "sent READY"
2. ✅ Background shows "Platforms now: {chatgptReady: true, claudeReady: true}"
3. ✅ Claude console shows "SEND_PROMPT command received" when discussion starts
4. ✅ Claude console shows "NEW MESSAGE DETECTED!" after Claude responds
5. ✅ Claude console shows "✓ NEW_MESSAGE sent successfully"
6. ✅ Background shows "========== NEW_MESSAGE from claude =========="
7. ✅ Background shows "✓ Updated lastClaudeAnswer and lastClaudeState"
8. ✅ Background shows "Logging message to dashboard: role=claude"
9. ✅ Dashboard displays Claude's message
10. ✅ Background shows "✓ Both platforms responded, processing round..."

## 📝 Log Summary

All logs are prefixed for easy filtering:

- `[BG]` - Background service worker
- `[CS chatgpt]` - ChatGPT content script
- `[CS claude]` - Claude content script
- `[Dashboard]` - Dashboard UI

Use browser console filter to focus on specific component.

## 🐛 Reporting Issues

If the issue persists, copy the following logs and share them:

1. **Background Console** - Full output from "Service worker started" to error
2. **Claude Console** - Full output from "script loaded" to where it gets stuck
3. **Specific issue** - Which step fails? (e.g., "Step 8: No message detection")

This will help identify exactly where the detection breaks!
