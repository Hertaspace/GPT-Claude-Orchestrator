// GPT-Claude Orchestrator - Background Service Worker
// Manages orchestration state machine and coordinates between ChatGPT, Claude, and dashboard

// ============================================================================
// Global State Management - Persists across dashboard reloads
// ============================================================================

const sessions = new Map();
let currentSessionId = null;
let sessionCounter = 0;

// Platform ports and readiness - persist across dashboard reloads
let chatgptPort = null;
let claudePort = null;
let chatgptReady = false;
let claudeReady = false;

// Dashboard ports (can have multiple instances)
const dashboardPorts = [];

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_ROUNDS: 5,
  RESPONSE_TIMEOUT: 90000, // 90 seconds
  DISCUSS_MARKER: '<<DISCUSS>>',
  READY_MARKER: '<<READY_TO_SUMMARIZE>>'
};

// ============================================================================
// Utility Functions
// ============================================================================

function generateSessionId() {
  sessionCounter++;
  return `session_${Date.now()}_${sessionCounter}`;
}

function parseState(answerText) {
  if (!answerText) return 'UNKNOWN';
  if (answerText.includes(CONFIG.READY_MARKER)) return 'READY';
  if (answerText.includes(CONFIG.DISCUSS_MARKER)) return 'DISCUSS';
  return 'UNKNOWN';
}

function stripStateMarker(answerText) {
  if (!answerText) return '';
  const lines = answerText.split(/\r?\n/);
  const filtered = lines.filter(
    line => !line.trim().includes(CONFIG.DISCUSS_MARKER) &&
            !line.trim().includes(CONFIG.READY_MARKER)
  );
  return filtered.join('\n').trim();
}

function logToAllDashboards(message) {
  dashboardPorts.forEach(port => {
    try {
      port.postMessage(message);
    } catch (e) {
      console.error('[BG] Failed to send message to dashboard:', e);
    }
  });
}

function logMessage(sessionId, role, content, round = 0) {
  const message = {
    type: 'LOG_MESSAGE',
    sessionId,
    role,
    round,
    content,
    timestamp: Date.now()
  };
  console.log(`[BG] Logging message: ${role} in round ${round} for session ${sessionId}`);
  logToAllDashboards(message);
}

function updateSessionStatus(sessionId, status, detail = '') {
  const message = {
    type: 'SESSION_STATUS',
    sessionId,
    status,
    detail
  };
  console.log(`[BG] Session status: ${status} - ${detail}`);
  logToAllDashboards(message);
}

function buildMissingPlatformsMessage(chatgptReady, claudeReady) {
  const missing = [];
  if (!chatgptReady) missing.push('ChatGPT');
  if (!claudeReady) missing.push('Claude');

  if (missing.length === 0) return null;

  return `Please open ${missing.join(' and ')} in a tab and log in, then reload the tab.`;
}

// ============================================================================
// Prompt Templates
// ============================================================================

function getInitialPrompt(question, platform) {
  const platformName = platform === 'chatgpt' ? 'ChatGPT' : 'Claude';

  return `You are ${platformName}.
The user question is:

\`\`\`
${question}
\`\`\`

Please provide your own full solution or answer.
At this stage, do NOT refer to any other assistant.

If you think the problem is fully solved and needs no further discussion, write \`${CONFIG.READY_MARKER}\` on the last line of your answer.
If you think further discussion with another assistant could improve the answer, write \`${CONFIG.DISCUSS_MARKER}\` on the last line.

Apart from that last line, do not use \`${CONFIG.DISCUSS_MARKER}\` or \`${CONFIG.READY_MARKER}\` anywhere in the text.`;
}

function getDiscussionPrompt(question, platform, otherPlatformAnswer, ownPreviousAnswer = '') {
  const platformName = platform === 'chatgpt' ? 'ChatGPT' : 'Claude';
  const otherName = platform === 'chatgpt' ? 'Claude' : 'ChatGPT';

  return `You are ${platformName}, collaborating with another assistant named ${otherName}.

Here is the original user question:

\`\`\`
${question}
\`\`\`

Here is ${otherName}'s latest answer:

\`\`\`
${otherPlatformAnswer}
\`\`\`

${ownPreviousAnswer ? `Here is your previous answer:

\`\`\`
${ownPreviousAnswer}
\`\`\`` : ''}

Your task in this round:

1. Critically analyze ${otherName}'s answer: point out any mistakes, gaps, or unclear reasoning.
2. Update or refine your own position accordingly.
3. Explain your current best answer for the user, referencing your reasoning clearly.

You may speak to ${otherName} in the text ("${otherName}, I think you overlooked ...") — your words will be forwarded to ${otherName} in the next round.

At the very end of your answer, on a new line, output either:

* \`${CONFIG.DISCUSS_MARKER}\` if you believe another round of discussion could significantly improve the answer, or
* \`${CONFIG.READY_MARKER}\` if you believe the answer is already good enough for the user.

Do not use these marker strings anywhere else.`;
}

function getFinalSummaryPrompt(question, gptAnswer, claudeAnswer) {
  return `You are ChatGPT.
You and another assistant named Claude have finished your discussion about the user's question.

**User question:**

\`\`\`
${question}
\`\`\`

**Your final discussion answer:**

\`\`\`
${gptAnswer}
\`\`\`

**Claude's final discussion answer:**

\`\`\`
${claudeAnswer}
\`\`\`

Please now produce a single, final answer for the user with these goals:

1. Summarize any main points of agreement between you and Claude.
2. If there are disagreements, briefly explain them and state which position you judge more reliable, and why.
3. Provide a clear, well-structured final answer for the user, incorporating the best reasoning from both sides.

This is a one-shot response for the user. Do NOT ask Claude any further questions or suggest continuing the discussion.
Do NOT output any \`${CONFIG.DISCUSS_MARKER}\` or \`${CONFIG.READY_MARKER}\` markers.`;
}

// ============================================================================
// Session Management
// ============================================================================

function createSession(question) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    status: 'starting',
    question,
    round: 0,
    maxRounds: CONFIG.MAX_ROUNDS,
    lastGptAnswer: null,
    lastClaudeAnswer: null,
    lastGptState: null,
    lastClaudeState: null,
    waitingFor: new Set(),
    timeouts: new Map()
  };

  sessions.set(sessionId, session);
  currentSessionId = sessionId;
  console.log(`[BG] Created new session: ${sessionId}`);
  return session;
}

function resetSession() {
  console.log('[BG] Resetting session for new discussion');
  // Don't clear readiness flags - tabs are still open!
  // Just increment session counter so next START_SESSION gets a new ID
  sessionCounter++;
  currentSessionId = null;
}

function clearSessionTimeouts(session) {
  session.timeouts.forEach(timeout => clearTimeout(timeout));
  session.timeouts.clear();
}

function setResponseTimeout(sessionId, platform) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const timeoutId = setTimeout(() => {
    console.error(`[BG] ⏱ Response timeout for ${platform} in session ${sessionId}`);
    updateSessionStatus(sessionId, 'error',
      `${platform} did not respond within ${CONFIG.RESPONSE_TIMEOUT / 1000} seconds`);
    session.status = 'error';
  }, CONFIG.RESPONSE_TIMEOUT);

  session.timeouts.set(platform, timeoutId);
}

function clearResponseTimeout(session, platform) {
  const timeoutId = session.timeouts.get(platform);
  if (timeoutId) {
    clearTimeout(timeoutId);
    session.timeouts.delete(platform);
  }
}

// ============================================================================
// Orchestration Logic
// ============================================================================

function startSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    console.error(`[BG] ✗ startSession called but session ${sessionId} not found`);
    return;
  }

  console.log(`[BG] ▶ START_SESSION called for: ${sessionId}`);
  console.log('[BG] Readiness check:', {
    chatgptReady,
    claudeReady,
    chatgptPort: !!chatgptPort,
    claudePort: !!claudePort
  });

  // Check if both platforms are ready
  if (!chatgptReady || !claudeReady) {
    const errorMsg = buildMissingPlatformsMessage(chatgptReady, claudeReady);
    console.error('[BG] ✗ Cannot start session - platforms not ready:', errorMsg);
    console.error('[BG] Current readiness state:', { chatgptReady, claudeReady });
    updateSessionStatus(sessionId, 'error', errorMsg);
    session.status = 'error';
    return;
  }

  console.log(`[BG] ✓ Both platforms ready, starting session ${sessionId}`);
  updateSessionStatus(sessionId, 'starting', 'Sending initial prompts...');

  // Send initial prompts to both platforms
  session.waitingFor.add('chatgpt');
  session.waitingFor.add('claude');

  const gptPrompt = getInitialPrompt(session.question, 'chatgpt');
  const claudePrompt = getInitialPrompt(session.question, 'claude');

  sendPromptToPlatform('chatgpt', sessionId, gptPrompt);
  sendPromptToPlatform('claude', sessionId, claudePrompt);

  setResponseTimeout(sessionId, 'chatgpt');
  setResponseTimeout(sessionId, 'claude');
}

function sendPromptToPlatform(platform, sessionId, text) {
  const port = platform === 'chatgpt' ? chatgptPort : claudePort;
  if (!port) {
    console.error(`[BG] ✗ No port for ${platform}`);
    return;
  }

  try {
    console.log(`[BG] → Sending SEND_PROMPT to ${platform} for session ${sessionId}`);
    port.postMessage({
      type: 'SEND_PROMPT',
      sessionId,
      text
    });
  } catch (e) {
    console.error(`[BG] ✗ Failed to send prompt to ${platform}:`, e);
  }
}

function handleNewMessage(platform, content, providedSessionId) {
  console.log(`[BG] ← NEW_MESSAGE from ${platform}, sessionId: ${providedSessionId}`);

  // Find the active session (use provided sessionId or current session)
  let session;
  if (providedSessionId && sessions.has(providedSessionId)) {
    session = sessions.get(providedSessionId);
  } else if (currentSessionId && sessions.has(currentSessionId)) {
    session = sessions.get(currentSessionId);
  } else {
    // Get the most recent non-finished session
    const activeSessions = Array.from(sessions.values())
      .filter(s => s.status !== 'finished' && s.status !== 'error');
    session = activeSessions[activeSessions.length - 1];
  }

  if (!session) {
    console.warn('[BG] ⚠ Received message but no active session found');
    return;
  }

  const sessionId = session.id;
  console.log(`[BG] Processing message for session ${sessionId}, round ${session.round}, status ${session.status}`);

  // Special handling for final summary
  if (session.status === 'summarizing' && platform === 'chatgpt') {
    console.log('[BG] 📝 Detected final summary from ChatGPT');
    handleFinalSummary(content, sessionId);
    return;
  }

  // Clear timeout for this platform
  clearResponseTimeout(session, platform);

  // Remove from waiting list
  session.waitingFor.delete(platform);

  // Parse state and update session
  const state = parseState(content);
  const strippedContent = stripStateMarker(content);

  console.log(`[BG] Message state from ${platform}: ${state}`);

  if (platform === 'chatgpt') {
    session.lastGptAnswer = strippedContent;
    session.lastGptState = state;
  } else {
    session.lastClaudeAnswer = strippedContent;
    session.lastClaudeState = state;
  }

  // Log the message to dashboard
  const role = platform === 'chatgpt' ? 'chatgpt' : 'claude';
  logMessage(sessionId, role, content, session.round);

  console.log(`[BG] Waiting for: [${Array.from(session.waitingFor).join(', ')}]`);

  // Check if we're waiting for more responses in this round
  if (session.waitingFor.size > 0) {
    console.log(`[BG] ⏳ Still waiting for ${session.waitingFor.size} more platform(s)`);
    return; // Wait for other platform
  }

  console.log('[BG] ✓ Both platforms responded, processing round...');
  // Both platforms have responded, decide next action
  processRound(session);
}

function processRound(session) {
  const sessionId = session.id;

  console.log(`[BG] 🔄 processRound for session ${sessionId}, status: ${session.status}, round: ${session.round}`);

  if (session.status === 'starting') {
    // First round complete, move to discussing
    session.status = 'discussing';
    session.round = 1;
    updateSessionStatus(sessionId, 'discussing', `Round ${session.round} complete`);
  }

  // Check if we should move to summary
  const bothReady = session.lastGptState === 'READY' && session.lastClaudeState === 'READY';
  const maxRoundsReached = session.round >= session.maxRounds;

  console.log(`[BG] Decision point: bothReady=${bothReady}, maxRoundsReached=${maxRoundsReached}`);
  console.log(`[BG] States: GPT=${session.lastGptState}, Claude=${session.lastClaudeState}`);

  if (bothReady || maxRoundsReached) {
    // Move to summary
    console.log('[BG] 📝 Moving to summary phase');
    moveToSummary(session);
  } else {
    // Continue discussion
    console.log('[BG] 💬 Continuing discussion to next round');
    continueDiscussion(session);
  }
}

function continueDiscussion(session) {
  const sessionId = session.id;
  session.round += 1;

  console.log(`[BG] 🔄 continueDiscussion - incrementing to round ${session.round}`);

  if (session.round > session.maxRounds) {
    console.log('[BG] Max rounds exceeded, moving to summary');
    moveToSummary(session);
    return;
  }

  updateSessionStatus(sessionId, 'discussing', `Starting round ${session.round}...`);

  // Send discussion prompts
  session.waitingFor.add('chatgpt');
  session.waitingFor.add('claude');

  const gptPrompt = getDiscussionPrompt(
    session.question,
    'chatgpt',
    session.lastClaudeAnswer,
    session.lastGptAnswer
  );

  const claudePrompt = getDiscussionPrompt(
    session.question,
    'claude',
    session.lastGptAnswer,
    session.lastClaudeAnswer
  );

  sendPromptToPlatform('chatgpt', sessionId, gptPrompt);
  sendPromptToPlatform('claude', sessionId, claudePrompt);

  setResponseTimeout(sessionId, 'chatgpt');
  setResponseTimeout(sessionId, 'claude');
}

function moveToSummary(session) {
  const sessionId = session.id;
  session.status = 'summarizing';
  console.log(`[BG] 📝 moveToSummary for session ${sessionId}`);
  updateSessionStatus(sessionId, 'summarizing', 'Generating final summary...');

  // Send summary prompt only to ChatGPT
  // Note: We don't add to waitingFor here because handleNewMessage
  // checks session.status === 'summarizing' to route to handleFinalSummary

  const summaryPrompt = getFinalSummaryPrompt(
    session.question,
    session.lastGptAnswer,
    session.lastClaudeAnswer
  );

  sendPromptToPlatform('chatgpt', sessionId, summaryPrompt);
  setResponseTimeout(sessionId, 'chatgpt');
}

function handleFinalSummary(content, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  console.log(`[BG] ✅ Final summary received for session ${sessionId}`);

  clearResponseTimeout(session, 'chatgpt');
  session.waitingFor.delete('chatgpt_final');

  // Log final answer
  logMessage(sessionId, 'final', content, 'final');

  // Mark session as finished
  session.status = 'finished';
  updateSessionStatus(sessionId, 'finished', 'Discussion complete');

  clearSessionTimeouts(session);
}

// ============================================================================
// Port Communication - Platform Content Scripts
// ============================================================================

function setupPlatformPort(port, platform) {
  console.log(`[BG] 🔌 Port connected: ${platform}`);

  if (platform === 'chatgpt') chatgptPort = port;
  if (platform === 'claude') claudePort = port;

  port.onMessage.addListener((msg) => {
    if (msg.type === 'READY') {
      console.log(`[BG] ✓ READY from ${platform}, URL: ${msg.url}`);
      if (platform === 'chatgpt') chatgptReady = true;
      if (platform === 'claude') claudeReady = true;

      // Notify all dashboards about readiness
      logToAllDashboards({
        type: 'PLATFORM_READY',
        platform,
        ready: true
      });
    } else if (msg.type === 'NEW_MESSAGE') {
      handleNewMessage(platform, msg.content, msg.sessionId);
    }
  });

  port.onDisconnect.addListener(() => {
    console.log(`[BG] 🔌✗ Port disconnected: ${platform}`);
    if (platform === 'chatgpt') {
      chatgptReady = false;
      chatgptPort = null;
    }
    if (platform === 'claude') {
      claudeReady = false;
      claudePort = null;
    }

    // Notify all dashboards about disconnection
    logToAllDashboards({
      type: 'PLATFORM_READY',
      platform,
      ready: false
    });
  });
}

// ============================================================================
// Port Communication - Main Listener
// ============================================================================

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chatgpt') {
    setupPlatformPort(port, 'chatgpt');
  } else if (port.name === 'claude') {
    setupPlatformPort(port, 'claude');
  } else if (port.name === 'dashboard') {
    console.log('[BG] 🔌 Dashboard connected');
    dashboardPorts.push(port);

    // Send current readiness state to new dashboard
    port.postMessage({
      type: 'PLATFORM_READY',
      platform: 'chatgpt',
      ready: chatgptReady
    });
    port.postMessage({
      type: 'PLATFORM_READY',
      platform: 'claude',
      ready: claudeReady
    });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'START_SESSION') {
        console.log('[BG] 📨 Received START_SESSION from dashboard');
        const session = createSession(msg.question);

        // Log user question
        logMessage(session.id, 'user', msg.question, 0);

        // Start orchestration
        startSession(session.id);
      } else if (msg.type === 'RESET_SESSION') {
        console.log('[BG] 🔄 Received RESET_SESSION from dashboard');
        resetSession();

        // Notify dashboard that reset is complete
        port.postMessage({
          type: 'SESSION_RESET',
          success: true
        });
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('[BG] 🔌✗ Dashboard disconnected');
      const index = dashboardPorts.indexOf(port);
      if (index > -1) {
        dashboardPorts.splice(index, 1);
      }
    });
  }
});

// ============================================================================
// Extension Action Click - Open Dashboard in Tab
// ============================================================================

chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL('dashboard.html');
  console.log('[BG] 🖱 Extension icon clicked, opening dashboard...');

  // Check if a dashboard tab is already open
  chrome.tabs.query({ url }, (tabs) => {
    if (tabs && tabs.length > 0) {
      // Focus existing dashboard tab
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
      console.log('[BG] Focused existing dashboard tab');
    } else {
      // Create new dashboard tab
      chrome.tabs.create({ url });
      console.log('[BG] Created new dashboard tab');
    }
  });
});

console.log('[BG] ✅ GPT-Claude Orchestrator background service worker loaded');
console.log('[BG] Initial state: chatgptReady=' + chatgptReady + ', claudeReady=' + claudeReady);
