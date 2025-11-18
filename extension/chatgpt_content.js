// GPT-Claude Orchestrator - ChatGPT Content Script
// Handles DOM interaction with ChatGPT web UI

(function() {
  'use strict';

  // ============================================================================
  // Immediate Connection and READY Signal - RUNS IMMEDIATELY AT SCRIPT LOAD
  // ============================================================================

  console.log('[CS chatgpt] script loaded at', location.href);

  // Port connection - using 'let' so we can reconnect if disconnected
  let port = null;

  function connectToBackground() {
    try {
      console.log('[CS chatgpt] Connecting to background...');
      port = chrome.runtime.connect({ name: 'chatgpt' });
      console.log('[CS chatgpt] ✓ Connected to background');

      // Send READY message
      port.postMessage({
        type: 'READY',
        platform: 'chatgpt',
        url: location.href
      });
      console.log('[CS chatgpt] ✓ Sent READY message');

      // Set up message listeners
      port.onMessage.addListener((msg) => {
        console.log('[CS chatgpt] ← Received message from background:', msg);
        if (msg.type === 'SEND_PROMPT') {
          console.log('[CS chatgpt] SEND_PROMPT command received');
          console.log('[CS chatgpt] SessionId:', msg.sessionId);
          console.log('[CS chatgpt] Text preview:', (msg.text || '').slice(0, 100));

          sendPrompt(msg.text, msg.sessionId).catch(err => {
            console.error('[CS chatgpt] ✗ Failed to send prompt:', err);
          });
        } else {
          console.log('[CS chatgpt] Unknown message type:', msg.type);
        }
      });

      // Handle disconnection
      port.onDisconnect.addListener(() => {
        console.error('[CS chatgpt] ✗ Port disconnected from background');
        port = null;

        // Try to reconnect after 2 seconds
        console.log('[CS chatgpt] Will attempt to reconnect in 2 seconds...');
        setTimeout(() => {
          console.log('[CS chatgpt] Attempting to reconnect...');
          connectToBackground();
        }, 2000);
      });

    } catch (error) {
      console.error('[CS chatgpt] ✗ Failed to connect to background:', error);
      port = null;

      // Retry connection after 3 seconds
      setTimeout(() => {
        console.log('[CS chatgpt] Retrying connection...');
        connectToBackground();
      }, 3000);
    }
  }

  // Connect immediately on script load
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
