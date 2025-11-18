// GPT-Claude Orchestrator - Claude Content Script
// Handles DOM interaction with Claude web UI

(function() {
  'use strict';

  // ============================================================================
  // Immediate Connection and READY Signal - RUNS IMMEDIATELY AT SCRIPT LOAD
  // ============================================================================

  console.log('[CS claude] script loaded at', location.href);

  // Port connection - using 'let' so we can reconnect if disconnected
  let port = null;

  function connectToBackground() {
    try {
      console.log('[CS claude] Connecting to background...');
      port = chrome.runtime.connect({ name: 'claude' });
      console.log('[CS claude] ✓ Connected to background');

      // Send READY message
      port.postMessage({
        type: 'READY',
        platform: 'claude',
        url: location.href
      });
      console.log('[CS claude] ✓ Sent READY message');

      // Set up message listeners
      port.onMessage.addListener((msg) => {
        console.log('[CS claude] ← Received message from background:', msg);

        if (msg.type === 'SEND_PROMPT') {
          console.log('[CS claude] SEND_PROMPT command received');
          console.log('[CS claude] SessionId:', msg.sessionId);
          console.log('[CS claude] Text preview:', (msg.text || '').slice(0, 100));

          sendPrompt(msg.text, msg.sessionId).catch(err => {
            console.error('[CS claude] ✗ Failed to send prompt:', err);
          });
        } else {
          console.log('[CS claude] Unknown message type:', msg.type);
        }
      });

      // Handle disconnection
      port.onDisconnect.addListener(() => {
        console.error('[CS claude] ✗ Port disconnected from background');
        port = null;

        // Try to reconnect after 2 seconds
        console.log('[CS claude] Will attempt to reconnect in 2 seconds...');
        setTimeout(() => {
          console.log('[CS claude] Attempting to reconnect...');
          connectToBackground();
        }, 2000);
      });

    } catch (error) {
      console.error('[CS claude] ✗ Failed to connect to background:', error);
      port = null;

      // Retry connection after 3 seconds
      setTimeout(() => {
        console.log('[CS claude] Retrying connection...');
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
    console.log('[CS claude] getClaudeMessages called');

    // Try multiple strategies to find Claude's assistant messages
    let claudeMessages = [];

    // Strategy 1: Look for data-is-streaming attribute (most reliable for current Claude UI)
    const streamingElements = document.querySelectorAll('[data-is-streaming]');
    console.log('[CS claude] Found elements with data-is-streaming:', streamingElements.length);

    if (streamingElements.length > 0) {
      claudeMessages = Array.from(streamingElements).filter(el => {
        // Only non-streaming messages
        return el.getAttribute('data-is-streaming') === 'false';
      });
      console.log('[CS claude] Non-streaming messages:', claudeMessages.length);
    }

    // Strategy 2: Look for font-claude-message class
    if (claudeMessages.length === 0) {
      claudeMessages = Array.from(document.querySelectorAll('.font-claude-message'));
      console.log('[CS claude] Messages with .font-claude-message:', claudeMessages.length);
    }

    // Strategy 3: Look for role="article" or similar
    if (claudeMessages.length === 0) {
      const articles = document.querySelectorAll('[role="article"]');
      console.log('[CS claude] Found [role="article"] elements:', articles.length);

      // Filter to only assistant messages (not user messages)
      claudeMessages = Array.from(articles).filter(article => {
        const text = article.textContent || '';
        // Basic heuristic: Claude messages are usually longer
        // and don't have specific user message markers
        return text.length > 50 && !article.className.includes('user');
      });
      console.log('[CS claude] Filtered assistant articles:', claudeMessages.length);
    }

    return claudeMessages;
  }

  function extractMessageText(messageElement) {
    console.log('[CS claude] Extracting text from element:', messageElement.className);

    // Try to find the content container (where the actual message is)
    // Claude usually has a specific structure for message content
    let contentElement = messageElement.querySelector('[class*="content"]') ||
                        messageElement.querySelector('[class*="prose"]') ||
                        messageElement.querySelector('.font-claude-message') ||
                        messageElement;

    console.log('[CS claude] Content element found:', contentElement.className);

    // Use HTML to Markdown converter if available for better formatting
    let text = '';
    if (typeof window.htmlToMarkdown === 'function') {
      console.log('[CS claude] Using HTML to Markdown converter');
      try {
        text = window.htmlToMarkdown(contentElement);
      } catch (error) {
        console.warn('[CS claude] HTML to Markdown conversion failed, falling back to innerText:', error);
        text = contentElement.innerText || contentElement.textContent || '';
      }
    } else {
      console.log('[CS claude] HTML to Markdown not available, using innerText');
      text = contentElement.innerText || contentElement.textContent || '';
    }

    text = text.trim();

    console.log('[CS claude] Extracted text length:', text.length);
    console.log('[CS claude] Extracted text preview:', text.slice(0, 200) + '...');

    return text;
  }

  function checkForNewMessages() {
    if (isProcessing) {
      console.log('[CS claude] Skipping check - isProcessing = true');
      return;
    }

    console.log('[CS claude] checkForNewMessages - lastMessageCount:', lastMessageCount);

    const claudeMessages = getClaudeMessages();
    console.log('[CS claude] Current message count:', claudeMessages.length);

    if (claudeMessages.length > lastMessageCount) {
      console.log('[CS claude] NEW MESSAGE DETECTED! Previous:', lastMessageCount, 'Current:', claudeMessages.length);

      // Check if generation is complete (no stop button visible and not streaming)
      const stopButton = findElement(SELECTORS.stopButton);
      if (stopButton && stopButton.offsetParent !== null) {
        console.log('[CS claude] Stop button still visible - still generating, will wait');
        return;
      }

      // Get the last message
      const lastMessage = claudeMessages[claudeMessages.length - 1];

      // Check for streaming attribute
      const isStreaming = lastMessage.getAttribute('data-is-streaming');
      console.log('[CS claude] Last message data-is-streaming:', isStreaming);

      if (isStreaming === 'true') {
        console.log('[CS claude] Still streaming - will wait');
        return;
      }

      // Extract the message text
      const text = extractMessageText(lastMessage);

      if (text && text.length > 0) {
        console.log('[CS claude] ✓ Complete message ready, length:', text.length);
        console.log('[CS claude] Message preview:', text.slice(0, 200));

        lastMessageCount = claudeMessages.length;

        // Send to background
        if (port) {
          const message = {
            type: 'NEW_MESSAGE',
            platform: 'claude',
            content: text,
            sessionId: currentSessionId
          };

          console.log('[CS claude] Sending NEW_MESSAGE to background for session:', currentSessionId);
          port.postMessage(message);
          console.log('[CS claude] ✓ NEW_MESSAGE sent successfully');
        } else {
          console.error('[CS claude] ✗ Cannot send message - port is null!');
        }
      } else {
        console.warn('[CS claude] Message text is empty, skipping');
      }
    } else {
      console.log('[CS claude] No new messages detected');
    }
  }

  // ============================================================================
  // Sending Prompts
  // ============================================================================

  function sendPrompt(text, sessionId) {
    console.log('[CS claude] sendPrompt called with sessionId:', sessionId);
    console.log('[CS claude] Prompt text length:', text.length);
    console.log('[CS claude] Prompt preview:', text.slice(0, 100) + '...');

    return new Promise((resolve, reject) => {
      try {
        isProcessing = true;
        currentSessionId = sessionId;
        console.log('[CS claude] Set currentSessionId to:', currentSessionId);

        // Find input area
        const input = findElement(SELECTORS.inputArea);
        if (!input) {
          console.error('[CS claude] ✗ Could not find input area!');
          reject(new Error('Could not find input area'));
          isProcessing = false;
          return;
        }

        console.log('[CS claude] ✓ Found input element:', input.tagName);

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
            console.log('[CS claude] Submit button not found, using Enter key fallback');

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
            console.log('[CS claude] ✓ Found submit button, clicking...');
            submitBtn.click();
          }

          // Reset processing flag after a delay
          setTimeout(() => {
            console.log('[CS claude] Prompt sent, resetting isProcessing flag');
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
  // Initialization
  // ============================================================================

  function initialize() {
    console.log('[CS claude] ===== Initializing DOM observers =====');
    console.log('[CS claude] Document ready state:', document.readyState);

    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      console.log('[CS claude] Document still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', initialize);
      return;
    }

    console.log('[CS claude] Document ready, starting observer...');

    // Start observing for new messages
    startObserver();

    // Get initial message count
    setTimeout(() => {
      const messages = getClaudeMessages();
      lastMessageCount = messages.length;
      console.log('[CS claude] ===== Initial message count:', lastMessageCount, '=====');
    }, 1000);
  }

  // Start initialization
  console.log('[CS claude] Calling initialize()...');
  initialize();

})();
