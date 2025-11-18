// GPT-Claude Orchestrator - ChatGPT Content Script
// Handles DOM interaction with ChatGPT web UI

(function() {
  'use strict';

  // ============================================================================
  // State
  // ============================================================================

  let port = null;
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
    // Try to get the text content, excluding any UI elements
    const contentArea = messageElement.querySelector('[data-message-content="true"]') ||
                       messageElement.querySelector('.markdown') ||
                       messageElement;

    return contentArea.innerText.trim();
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
  // Port Communication
  // ============================================================================

  function initializePort() {
    try {
      port = chrome.runtime.connect({ name: 'chatgpt' });
      console.log('[ChatGPT] Connected to background');

      // Send ready message
      const readyMsg = {
        type: 'READY',
        platform: 'chatgpt',
        url: location.href
      };
      port.postMessage(readyMsg);
      console.log('[ChatGPT] ✓ Sent READY message', readyMsg);

      // Listen for commands from background
      port.onMessage.addListener((msg) => {
        console.log('[ChatGPT] Received message from background:', msg.type);
        if (msg.type === 'SEND_PROMPT') {
          sendPrompt(msg.text, msg.sessionId).catch(err => {
            console.error('[ChatGPT] Failed to send prompt:', err);
          });
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[ChatGPT] Port disconnected, attempting to reconnect...');
        port = null;
        setTimeout(initializePort, 1000);
      });

    } catch (error) {
      console.error('[ChatGPT] Failed to connect to background:', error);
      setTimeout(initializePort, 2000);
    }
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  function initialize() {
    console.log('[ChatGPT] Content script initializing on:', location.href);

    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
      return;
    }

    console.log('[ChatGPT] Page loaded, connecting to background...');

    // Initialize port connection
    initializePort();

    // Start observing for new messages
    startObserver();

    // Get initial message count
    setTimeout(() => {
      const messages = getAssistantMessages();
      lastMessageCount = messages.length;
      console.log(`Initial message count: ${lastMessageCount}`);
    }, 1000);
  }

  // Start initialization
  initialize();

})();
