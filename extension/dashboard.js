// GPT-Claude Orchestrator - Dashboard UI Script
// Handles user interface and communication with background service worker

(function() {
  'use strict';

  // ============================================================================
  // DOM Elements
  // ============================================================================

  const elements = {
    question: document.getElementById('question'),
    startBtn: document.getElementById('startBtn'),
    newBtn: document.getElementById('newBtn'),
    clearBtn: document.getElementById('clearBtn'),
    log: document.getElementById('log'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.getElementById('themeIcon')
  };

  // ============================================================================
  // State
  // ============================================================================

  let port = null;
  let currentSessionId = null;
  let isSessionActive = false;

  // ============================================================================
  // Utility Functions
  // ============================================================================

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function clearEmptyState() {
    const emptyState = elements.log.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
  }

  function updateStatus(status, text) {
    elements.statusText.textContent = text;
    elements.statusDot.className = 'status-dot';

    if (status === 'ready') {
      elements.statusDot.classList.add('ready');
    } else if (status === 'active') {
      elements.statusDot.classList.add('active');
    } else if (status === 'error') {
      elements.statusDot.classList.add('error');
    }
  }

  function getRoleName(role) {
    const names = {
      'user': 'You',
      'chatgpt': 'ChatGPT',
      'claude': 'Claude',
      'final': 'Final Summary'
    };
    return names[role] || role;
  }

  function getRoundLabel(round) {
    if (round === 0) return 'Initial';
    if (round === 'final') return 'Final';
    return `Round ${round}`;
  }

  // ============================================================================
  // Theme Management
  // ============================================================================

  async function loadTheme() {
    try {
      const result = await chrome.storage.local.get(['theme']);
      const theme = result.theme || 'light';
      if (theme === 'dark') {
        document.body.classList.add('dark');
        updateThemeIcon();
      }
      console.log('[Dashboard] Loaded theme:', theme);
    } catch (error) {
      console.error('[Dashboard] Failed to load theme:', error);
    }
  }

  function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark');
    elements.themeIcon.textContent = isDark ? '☀️' : '🌙';
  }

  async function toggleTheme() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    const theme = isDark ? 'dark' : 'light';

    try {
      await chrome.storage.local.set({ theme });
      console.log('[Dashboard] Theme saved:', theme);
    } catch (error) {
      console.error('[Dashboard] Failed to save theme:', error);
    }

    updateThemeIcon();
  }

  // ============================================================================
  // Message Display
  // ============================================================================

  function appendMessage(role, content, round, timestamp) {
    clearEmptyState();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';

    const badge = document.createElement('span');
    badge.className = 'message-badge';
    badge.textContent = getRoleName(role);

    const roundIndicator = document.createElement('span');
    roundIndicator.className = 'round-indicator';
    roundIndicator.textContent = getRoundLabel(round);

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = formatTimestamp(timestamp);

    headerDiv.appendChild(badge);
    headerDiv.appendChild(roundIndicator);
    headerDiv.appendChild(timestampSpan);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);

    elements.log.appendChild(messageDiv);

    // Auto-scroll to bottom
    elements.log.scrollTop = elements.log.scrollHeight;
  }

  function clearLog() {
    elements.log.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        <p>No messages yet. Start a discussion to see the conversation here.</p>
      </div>
    `;
  }

  // ============================================================================
  // Port Communication
  // ============================================================================

  function initializePort() {
    try {
      port = chrome.runtime.connect({ name: 'dashboard' });
      console.log('[Dashboard] Connected to background');

      port.onMessage.addListener((msg) => {
        console.log('[Dashboard] Received message:', msg.type);
        if (msg.type === 'LOG_MESSAGE') {
          appendMessage(msg.role, msg.content, msg.round, msg.timestamp);

          // Update current session ID
          if (msg.sessionId) {
            currentSessionId = msg.sessionId;
          }
        } else if (msg.type === 'SESSION_STATUS') {
          handleSessionStatus(msg);
        } else if (msg.type === 'PLATFORM_READY') {
          console.log(`[Dashboard] Platform readiness: ${msg.platform} = ${msg.ready}`);
          // Update UI to show platform status if needed
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[Dashboard] Port disconnected from background');
        updateStatus('error', 'Disconnected from background');
        port = null;
        setTimeout(initializePort, 1000);
      });

      updateStatus('ready', 'Connected and ready');
      console.log('[Dashboard] Ready to start sessions');
    } catch (error) {
      console.error('[Dashboard] Failed to connect to background:', error);
      updateStatus('error', 'Failed to connect');
      setTimeout(initializePort, 2000);
    }
  }

  function handleSessionStatus(msg) {
    const statusMessages = {
      'starting': 'Starting discussion...',
      'discussing': `Discussion in progress - ${msg.detail || ''}`,
      'summarizing': 'Generating final summary...',
      'finished': 'Discussion complete!',
      'error': `Error: ${msg.detail || 'Unknown error'}`
    };

    const statusText = statusMessages[msg.status] || msg.status;
    const statusType = msg.status === 'error' ? 'error' :
                      msg.status === 'finished' ? 'ready' : 'active';

    updateStatus(statusType, statusText);

    if (msg.status === 'finished' || msg.status === 'error') {
      isSessionActive = false;
      elements.startBtn.disabled = false;
      elements.startBtn.textContent = 'Start Discussion';
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleStartClick() {
    const question = elements.question.value.trim();

    if (!question) {
      alert('Please enter a question before starting the discussion.');
      return;
    }

    if (!port) {
      alert('Not connected to background service. Please try reloading the extension.');
      return;
    }

    console.log('[Dashboard] Starting new session with question:', question);

    // Disable button and update UI
    isSessionActive = true;
    elements.startBtn.disabled = true;
    elements.startBtn.textContent = 'Discussion in progress...';
    updateStatus('active', 'Initiating discussion...');

    // Send start session message
    const startMsg = {
      type: 'START_SESSION',
      question: question
    };
    port.postMessage(startMsg);
    console.log('[Dashboard] Sent START_SESSION message');
  }

  function handleClearClick() {
    if (isSessionActive) {
      const confirm = window.confirm('A discussion is currently active. Are you sure you want to clear the log?');
      if (!confirm) return;
    }

    clearLog();
    updateStatus('ready', 'Log cleared - ready to start');
  }

  function handleNewClick() {
    if (isSessionActive) {
      const confirm = window.confirm('A discussion is currently active. Are you sure you want to start a new discussion?');
      if (!confirm) return;
    }

    console.log('[Dashboard] Starting new discussion - resetting session');

    // Send reset message to background
    if (port) {
      port.postMessage({ type: 'RESET_SESSION' });
    }

    // Clear UI
    elements.question.value = '';
    clearLog();
    isSessionActive = false;
    currentSessionId = null;
    elements.startBtn.disabled = false;
    elements.startBtn.textContent = 'Start Discussion';
    updateStatus('ready', 'Ready for new discussion');

    // Focus question input
    elements.question.focus();
  }

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  function handleKeyDown(event) {
    // Enter (without Shift) → start discussion
    // Shift+Enter → insert newline (default behavior)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isSessionActive) {
        handleStartClick();
      }
    }
    // Shift+Enter: allow default behavior (newline)
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  function initialize() {
    console.log('Dashboard initializing...');

    // Load saved theme
    loadTheme();

    // Set up event listeners
    elements.startBtn.addEventListener('click', handleStartClick);
    elements.newBtn.addEventListener('click', handleNewClick);
    elements.clearBtn.addEventListener('click', handleClearClick);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.question.addEventListener('keydown', handleKeyDown);

    // Initialize port connection
    initializePort();

    // Focus question input
    elements.question.focus();

    console.log('Dashboard initialized');
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
