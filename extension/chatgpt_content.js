// GPT-Claude Orchestrator - ChatGPT Content Script
// Handles DOM interaction with ChatGPT web UI

(function() {
  'use strict';

  // ============================================================================
  // Immediate Connection and READY Signal - RUNS IMMEDIATELY AT SCRIPT LOAD
  // ============================================================================

  console.log('[CS chatgpt] script loaded at', location.href);

  // Port connection with robust reconnection
  let port = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000; // 1 second

  function getReconnectDelay() {
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    return Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
  }

  function connectToBackground() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    try {
      console.log(`[CS chatgpt] Connecting... (attempt ${reconnectAttempts + 1})`);
      port = chrome.runtime.connect({ name: 'chatgpt' });
      console.log('[CS chatgpt] ✓ Connected');

      // Reset attempts on success
      reconnectAttempts = 0;

      port.postMessage({
        type: 'READY',
        platform: 'chatgpt',
        url: location.href
      });
      console.log('[CS chatgpt] ✓ Sent READY');

      port.onMessage.addListener((msg) => {
        if (msg.type === 'SEND_PROMPT') {
          console.log('[CS chatgpt] SEND_PROMPT:', msg.sessionId);
          sendPrompt(msg.text, msg.sessionId).catch(err => {
            console.error('[CS chatgpt] ✗ Send prompt failed:', err);
          });
        } else if (msg.type === 'PING') {
          port.postMessage({ type: 'PONG', platform: 'chatgpt' });
        }
      });

      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.warn('[CS chatgpt] ⚠ Disconnected:', error?.message || 'unknown');
        port = null;

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = getReconnectDelay();
          console.log(`[CS chatgpt] 🔄 Reconnecting in ${delay}ms (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer = setTimeout(() => {
            reconnectAttempts++;
            connectToBackground();
          }, delay);
        } else {
          console.error('[CS chatgpt] ✗ Max retries reached. Please refresh page.');
          showReconnectNotice();
        }
      });

    } catch (error) {
      console.error('[CS chatgpt] ✗ Connection failed:', error.message);
      port = null;

      if (error.message?.includes('Extension context invalidated')) {
        console.error('[CS chatgpt] ✗ Extension reloaded. Please refresh page.');
        showReconnectNotice('Extension reloaded');
        return;
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay();
        console.log(`[CS chatgpt] 🔄 Retry in ${delay}ms`);
        reconnectTimer = setTimeout(() => {
          reconnectAttempts++;
          connectToBackground();
        }, delay);
      } else {
        showReconnectNotice();
      }
    }
  }

  function showReconnectNotice(reason) {
    if (document.getElementById('gco-reconnect-notice')) return;
    const notice = document.createElement('div');
    notice.id = 'gco-reconnect-notice';
    notice.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 999999;
      background: #ef4444; color: white; padding: 16px 20px;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif; font-size: 14px; max-width: 300px;
    `;
    notice.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">🔌 GPT-Claude Orchestrator</div>
      <div style="margin-bottom: 12px;">${reason ? reason + '. ' : ''}Connection lost. Please refresh.</div>
      <button onclick="location.reload()" style="background: white; color: #ef4444; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">
        Refresh Page
      </button>
    `;
    document.body.appendChild(notice);
  }

  connectToBackground();

  // ============================================================================
  // State
  // ============================================================================

  let lastMessageCount = 0;
  let currentSessionId = null;
  let isProcessing = false;

  // ============================================================================
  // DOM Selectors and Utilities
  // ============================================================================

  // ChatGPT UI selectors (may need updating based on UI changes)
  const SELECTORS = {
    // Input area - try multiple selectors for robustness
    inputArea: [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'textarea',
      '[contenteditable="true"][role="textbox"]'
    ],

    // Submit button
    submitButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'form button[type="submit"]',
      'button svg[data-icon="arrow-up"]'
    ],

    // Message containers
    messages: [
      '[data-message-author-role="assistant"]',
      '.group\\/conversation-turn',
      '[role="article"]'
    ],

    // Stop button (indicates generation in progress)
    stopButton: [
      'button[aria-label="Stop generating"]',
      'button[data-testid="stop-button"]'
    ]
  };

  function findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function findAllElements(selectors) {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) return Array.from(elements);
    }
    return [];
  }

  // ============================================================================
  // Message Detection
  // ============================================================================

  function getAssistantMessages() {
    const messages = findAllElements(SELECTORS.messages);
    return messages.filter(msg => {
      // Filter to only assistant messages
      const role = msg.getAttribute('data-message-author-role');
      if (role === 'assistant') return true;

      // Fallback: check if it doesn't look like a user message
      const hasUserIndicator = msg.querySelector('[data-message-author-role="user"]');
      return !hasUserIndicator;
    });
  }

  function extractMessageText(messageElement) {
    // Try to get the content area, excluding any UI elements
    const contentArea = messageElement.querySelector('[data-message-content="true"]') ||
                       messageElement.querySelector('.markdown') ||
                       messageElement.querySelector('[class*="prose"]') ||
                       messageElement;

    console.log('[CS chatgpt] Extracting from content area:', contentArea.className);

    // Use HTML to Markdown converter if available for better formatting
    let text = '';
    if (typeof window.htmlToMarkdown === 'function') {
      console.log('[CS chatgpt] Using HTML to Markdown converter');
      try {
        text = window.htmlToMarkdown(contentArea);
      } catch (error) {
        console.warn('[CS chatgpt] HTML to Markdown conversion failed, falling back to innerText:', error);
        text = contentArea.innerText || contentArea.textContent || '';
      }
    } else {
      console.log('[CS chatgpt] HTML to Markdown not available, using innerText');
      text = contentArea.innerText || contentArea.textContent || '';
    }

    return text.trim();
  }

  function checkForNewMessages() {
    if (isProcessing) return; // Don't check while we're processing

    const assistantMessages = getAssistantMessages();

    if (assistantMessages.length > lastMessageCount) {
      // Check if generation is complete (no stop button visible)
      const stopButton = findElement(SELECTORS.stopButton);
      if (stopButton) {
        // Still generating, wait
        return;
      }

      // Get the last message
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const text = extractMessageText(lastMessage);

      if (text && text.length > 0) {
        lastMessageCount = assistantMessages.length;

        // Send to background
        if (port) {
          port.postMessage({
            type: 'NEW_MESSAGE',
            platform: 'chatgpt',
            content: text,
            sessionId: currentSessionId
          });
        }
      }
    }
  }

  // ============================================================================
  // Sending Prompts
  // ============================================================================

  function sendPrompt(text, sessionId) {
    return new Promise((resolve, reject) => {
      try {
        isProcessing = true;
        currentSessionId = sessionId;

        // Find input area
        const input = findElement(SELECTORS.inputArea);
        if (!input) {
          reject(new Error('Could not find input area'));
          isProcessing = false;
          return;
        }

        // Set the text
        if (input.tagName === 'TEXTAREA') {
          // For textarea elements
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // For contenteditable divs
          input.textContent = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Trigger input events
        input.focus();

        // Wait a bit for UI to update
        setTimeout(() => {
          // Find and click submit button
          const submitBtn = findElement(SELECTORS.submitButton);
          if (!submitBtn) {
            // Fallback: try Enter key
            input.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true
            }));
          } else {
            submitBtn.click();
          }

          // Reset processing flag after a delay
          setTimeout(() => {
            isProcessing = false;
            resolve();
          }, 2000);
        }, 500);

      } catch (error) {
        console.error('Error sending prompt:', error);
        isProcessing = false;
        reject(error);
      }
    });
  }

  // ============================================================================
  // Mutation Observer
  // ============================================================================

  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      // Debounce: check for new messages after a short delay
      setTimeout(() => {
        checkForNewMessages();
      }, 1000);
    });

    // Observe the main content area
    const mainElement = document.querySelector('main') || document.body;
    observer.observe(mainElement, {
      childList: true,
      subtree: true
    });

    console.log('ChatGPT observer started');
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  function initialize() {
    console.log('[CS chatgpt] Initializing DOM observers...');

    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
      return;
    }

    // Start observing for new messages
    startObserver();

    // Get initial message count
    setTimeout(() => {
      const messages = getAssistantMessages();
      lastMessageCount = messages.length;
      console.log('[CS chatgpt] Initial message count:', lastMessageCount);
    }, 1000);
  }

  // Start initialization
  initialize();

})();
