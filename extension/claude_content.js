// GPT-Claude Orchestrator - Claude Content Script
// Handles DOM interaction with Claude web UI

(function() {
  'use strict';

  // ============================================================================
  // Immediate Connection and READY Signal - RUNS IMMEDIATELY AT SCRIPT LOAD
  // ============================================================================

  console.log('[CS claude] script loaded at', location.href);

  // Connect to background immediately - NO conditions, NO async, NO events
  const port = chrome.runtime.connect({ name: 'claude' });
  console.log('[CS claude] connected to background');

  // Send READY message immediately
  port.postMessage({
    type: 'READY',
    platform: 'claude',
    url: location.href
  });
  console.log('[CS claude] sent READY');

  // ============================================================================
  // State
  // ============================================================================

  let lastMessageCount = 0;
  let currentSessionId = null;
  let isProcessing = false;

  // ============================================================================
  // DOM Selectors and Utilities
  // ============================================================================

  // Claude UI selectors (may need updating based on UI changes)
  const SELECTORS = {
    // Input area - try multiple selectors for robustness
    inputArea: [
      'div[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
      '.ProseMirror'
    ],

    // Submit button
    submitButton: [
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      'button svg[data-icon="send"]',
      'form button:not([aria-label*="Stop"])'
    ],

    // Message containers for Claude's responses
    messages: [
      'div[data-is-streaming="false"]',
      '.font-claude-message',
      '[role="article"]'
    ],

    // All conversation items (to distinguish user vs assistant)
    conversationItems: [
      'div.font-user-message',
      'div.font-claude-message'
    ],

    // Stop button (indicates generation in progress)
    stopButton: [
      'button[aria-label*="Stop"]',
      'button[aria-label="Stop generating"]'
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

  function getClaudeMessages() {
    // Claude messages can be identified by class or structure
    // Try to find all assistant messages
    const allDivs = document.querySelectorAll('div');
    const claudeMessages = [];

    allDivs.forEach(div => {
      // Check for Claude-specific classes or attributes
      const className = div.className || '';
      if (className.includes('font-claude-message') ||
          className.includes('claude') ||
          div.getAttribute('data-is-streaming') !== null) {
        claudeMessages.push(div);
      }
    });

    // Fallback: look for conversation structure
    if (claudeMessages.length === 0) {
      // Find all message-like divs and filter out user messages
      const possibleMessages = Array.from(document.querySelectorAll('[role="article"], .group, div[class*="message"]'));
      return possibleMessages.filter(msg => {
        const text = msg.textContent;
        // Simple heuristic: user messages are usually shorter and don't have the response structure
        return text.length > 100 && !msg.className.includes('user');
      });
    }

    return claudeMessages;
  }

  function extractMessageText(messageElement) {
    // Try to get the text content, excluding any UI elements
    // Look for the main content area
    const contentSelectors = [
      '.font-claude-message',
      '[data-is-streaming="false"]',
      'div[class*="prose"]',
      'div[class*="content"]'
    ];

    let contentArea = messageElement;
    for (const selector of contentSelectors) {
      const found = messageElement.querySelector(selector);
      if (found) {
        contentArea = found;
        break;
      }
    }

    return contentArea.innerText.trim();
  }

  function checkForNewMessages() {
    if (isProcessing) return; // Don't check while we're processing

    const claudeMessages = getClaudeMessages();

    if (claudeMessages.length > lastMessageCount) {
      // Check if generation is complete (no stop button visible and not streaming)
      const stopButton = findElement(SELECTORS.stopButton);
      if (stopButton && stopButton.offsetParent !== null) {
        // Still generating, wait
        return;
      }

      // Check for streaming attribute
      const lastMessage = claudeMessages[claudeMessages.length - 1];
      const isStreaming = lastMessage.getAttribute('data-is-streaming');
      if (isStreaming === 'true') {
        // Still streaming, wait
        return;
      }

      // Get the last message text
      const text = extractMessageText(lastMessage);

      if (text && text.length > 0) {
        lastMessageCount = claudeMessages.length;

        // Send to background
        if (port) {
          port.postMessage({
            type: 'NEW_MESSAGE',
            platform: 'claude',
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
          // For contenteditable divs (more common in Claude)
          // Clear existing content
          input.innerHTML = '';

          // Create a text node or set textContent
          input.textContent = text;

          // Trigger input event
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          // For ProseMirror editors, we might need to trigger additional events
          const inputEvent = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
          });
          input.dispatchEvent(inputEvent);
        }

        // Focus the input
        input.focus();

        // Wait a bit for UI to update
        setTimeout(() => {
          // Find and click submit button
          const submitBtn = findElement(SELECTORS.submitButton);
          if (!submitBtn) {
            // Fallback: try Enter key
            const enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true,
              cancelable: true
            });
            input.dispatchEvent(enterEvent);

            // Also try keypress and keyup
            input.dispatchEvent(new KeyboardEvent('keypress', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              bubbles: true
            }));
          } else {
            // Click the submit button
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
      subtree: true,
      attributes: true,
      attributeFilter: ['data-is-streaming']
    });

    console.log('Claude observer started');
  }

  // ============================================================================
  // Port Message Handlers
  // ============================================================================

  // Listen for commands from background
  port.onMessage.addListener((msg) => {
    console.log('[CS claude] Received message from background:', msg.type);
    if (msg.type === 'SEND_PROMPT') {
      sendPrompt(msg.text, msg.sessionId).catch(err => {
        console.error('[CS claude] Failed to send prompt:', err);
      });
    }
  });

  port.onDisconnect.addListener(() => {
    console.warn('[CS claude] Port disconnected from background');
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  function initialize() {
    console.log('[CS claude] Initializing DOM observers...');

    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
      return;
    }

    // Start observing for new messages
    startObserver();

    // Get initial message count
    setTimeout(() => {
      const messages = getClaudeMessages();
      lastMessageCount = messages.length;
      console.log('[CS claude] Initial message count:', lastMessageCount);
    }, 1000);
  }

  // Start initialization
  initialize();

})();
