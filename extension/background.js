// GPT-Claude Orchestrator - Background Service Worker
// Manages orchestration state machine and coordinates between ChatGPT, Claude, and dashboard

// ============================================================================
// State Management
// ============================================================================

const sessions = new Map();
const ports = {
  chatgpt: null,
  claude: null,
  dashboards: [] // Multiple dashboard instances possible
};

const platformReady = {
  chatgpt: false,
  claude: false
};

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
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function parseState(answerText) {
  if (answerText.includes(CONFIG.READY_MARKER)) return 'READY';
  if (answerText.includes(CONFIG.DISCUSS_MARKER)) return 'DISCUSS';
  return 'UNKNOWN';
}

function stripStateMarker(answerText) {
  const lines = answerText.split(/\r?\n/);
  const filtered = lines.filter(
    line => !line.trim().startsWith(CONFIG.DISCUSS_MARKER) &&
            !line.trim().startsWith(CONFIG.READY_MARKER)
  );
  return filtered.join('\n').trim();
}

function logToAllDashboards(message) {
  ports.dashboards.forEach(port => {
    try {
      port.postMessage(message);
    } catch (e) {
      console.error('Failed to send message to dashboard:', e);
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
  logToAllDashboards(message);
}

function updateSessionStatus(sessionId, status, detail = '') {
  const message = {
    type: 'SESSION_STATUS',
    sessionId,
    status,
    detail
  };
  logToAllDashboards(message);
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
  return session;
}

function clearSessionTimeouts(session) {
  session.timeouts.forEach(timeout => clearTimeout(timeout));
  session.timeouts.clear();
}

function setResponseTimeout(sessionId, platform) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const timeoutId = setTimeout(() => {
    console.error(`Response timeout for ${platform} in session ${sessionId}`);
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
  if (!session) return;

  // Check if both platforms are ready
  if (!platformReady.chatgpt || !platformReady.claude) {
    updateSessionStatus(sessionId, 'error',
      'Please open ChatGPT and Claude in tabs and log in, then try again.');
    session.status = 'error';
    return;
  }

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
  const port = ports[platform];
  if (!port) {
    console.error(`No port for ${platform}`);
    return;
  }

  try {
    port.postMessage({
      type: 'SEND_PROMPT',
      sessionId,
      text
    });
  } catch (e) {
    console.error(`Failed to send prompt to ${platform}:`, e);
  }
}

function handleNewMessage(platform, content, providedSessionId) {
  // Find the active session (use provided sessionId or find the most recent)
  let session;
  if (providedSessionId && sessions.has(providedSessionId)) {
    session = sessions.get(providedSessionId);
  } else {
    // Get the most recent non-finished session
    const activeSessions = Array.from(sessions.values())
      .filter(s => s.status !== 'finished' && s.status !== 'error');
    session = activeSessions[activeSessions.length - 1];
  }

  if (!session) {
    console.warn('Received message but no active session found');
    return;
  }

  const sessionId = session.id;

  // Clear timeout for this platform
  clearResponseTimeout(session, platform);

  // Remove from waiting list
  session.waitingFor.delete(platform);

  // Parse state and update session
  const state = parseState(content);
  const strippedContent = stripStateMarker(content);

  if (platform === 'chatgpt') {
    session.lastGptAnswer = strippedContent;
    session.lastGptState = state;
  } else {
    session.lastClaudeAnswer = strippedContent;
    session.lastClaudeState = state;
  }

  // Log the message
  const role = platform === 'chatgpt' ? 'chatgpt' : 'claude';
  logMessage(sessionId, role, content, session.round);

  // Check if we're waiting for more responses in this round
  if (session.waitingFor.size > 0) {
    return; // Wait for other platform
  }

  // Both platforms have responded, decide next action
  processRound(session);
}

function processRound(session) {
  const sessionId = session.id;

  if (session.status === 'starting') {
    // First round complete, move to discussing
    session.status = 'discussing';
    session.round = 1;
    updateSessionStatus(sessionId, 'discussing', `Round ${session.round} complete`);
  }

  // Check if we should move to summary
  const bothReady = session.lastGptState === 'READY' && session.lastClaudeState === 'READY';
  const maxRoundsReached = session.round >= session.maxRounds;

  if (bothReady || maxRoundsReached) {
    // Move to summary
    moveToSummary(session);
  } else {
    // Continue discussion
    continueDiscussion(session);
  }
}

function continueDiscussion(session) {
  const sessionId = session.id;
  session.round += 1;

  if (session.round > session.maxRounds) {
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
  updateSessionStatus(sessionId, 'summarizing', 'Generating final summary...');

  // Send summary prompt only to ChatGPT
  session.waitingFor.add('chatgpt_final');

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
// Port Communication
// ============================================================================

chrome.runtime.onConnect.addListener((port) => {
  console.log('Port connected:', port.name);

  if (port.name === 'chatgpt') {
    ports.chatgpt = port;

    port.onMessage.addListener((msg) => {
      if (msg.type === 'READY') {
        platformReady.chatgpt = true;
        console.log('ChatGPT is ready');
      } else if (msg.type === 'NEW_MESSAGE') {
        // Check if this is a final summary or regular discussion
        const session = msg.sessionId ? sessions.get(msg.sessionId) :
          Array.from(sessions.values()).filter(s => s.status !== 'finished' && s.status !== 'error').pop();

        if (session && session.status === 'summarizing') {
          handleFinalSummary(msg.content, session.id);
        } else {
          handleNewMessage('chatgpt', msg.content, msg.sessionId);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      ports.chatgpt = null;
      platformReady.chatgpt = false;
      console.log('ChatGPT disconnected');
    });

  } else if (port.name === 'claude') {
    ports.claude = port;

    port.onMessage.addListener((msg) => {
      if (msg.type === 'READY') {
        platformReady.claude = true;
        console.log('Claude is ready');
      } else if (msg.type === 'NEW_MESSAGE') {
        handleNewMessage('claude', msg.content, msg.sessionId);
      }
    });

    port.onDisconnect.addListener(() => {
      ports.claude = null;
      platformReady.claude = false;
      console.log('Claude disconnected');
    });

  } else if (port.name === 'dashboard') {
    ports.dashboards.push(port);

    port.onMessage.addListener((msg) => {
      if (msg.type === 'START_SESSION') {
        const session = createSession(msg.question);

        // Log user question
        logMessage(session.id, 'user', msg.question, 0);

        // Start orchestration
        startSession(session.id);
      }
    });

    port.onDisconnect.addListener(() => {
      const index = ports.dashboards.indexOf(port);
      if (index > -1) {
        ports.dashboards.splice(index, 1);
      }
      console.log('Dashboard disconnected');
    });
  }
});

console.log('GPT-Claude Orchestrator background service worker loaded');
