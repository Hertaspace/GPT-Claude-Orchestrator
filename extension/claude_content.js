// GPT-Claude Orchestrator - Claude Content Script
// Handles DOM interaction with Claude web UI

(function() {
  'use strict';

  // ============================================================================
  // Immediate Connection and READY Signal - RUNS IMMEDIATELY AT SCRIPT LOAD
  // ============================================================================

  console.log('[CS claude] script loaded at', location.href);

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
      console.log(`[CS claude] Connecting... (attempt ${reconnectAttempts + 1})`);
      port = chrome.runtime.connect({ name: 'claude' });
      console.log('[CS claude] ✓ Connected');

      // Reset attempts on success
      reconnectAttempts = 0;

      port.postMessage({
        type: 'READY',
        platform: 'claude',
        url: location.href
      });
      console.log('[CS claude] ✓ Sent READY');

      port.onMessage.addListener((msg) => {
        if (msg.type === 'SEND_PROMPT') {
          console.log('[CS claude] SEND_PROMPT:', msg.sessionId);
          sendPrompt(msg.text, msg.sessionId).catch(err => {
            console.error('[CS claude] ✗ Send prompt failed:', err);
          });
        } else if (msg.type === 'START_NEW_CHAT') {
          console.log('[CS claude] START_NEW_CHAT');
          startNewChat();
        } else if (msg.type === 'PING') {
          port.postMessage({ type: 'PONG', platform: 'claude' });
        }
      });

      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.warn('[CS claude] ⚠ Disconnected:', error?.message || 'unknown');
        port = null;

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = getReconnectDelay();
          console.log(`[CS claude] 🔄 Reconnecting in ${delay}ms (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer = setTimeout(() => {
            reconnectAttempts++;
            connectToBackground();
          }, delay);
        } else {
          console.error('[CS claude] ✗ Max retries reached. Please refresh page.');
          showReconnectNotice();
        }
      });

    } catch (error) {
      console.error('[CS claude] ✗ Connection failed:', error.message);
      port = null;

      if (error.message?.includes('Extension context invalidated')) {
        console.error('[CS claude] ✗ Extension reloaded. Please refresh page.');
        showReconnectNotice('Extension reloaded');
        return;
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay();
        console.log(`[CS claude] 🔄 Retry in ${delay}ms`);
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
  let streamingInterval = null;
  let lastStreamedContent = '';
  let isCurrentlyStreaming = false;

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
    ],

    // New chat button
    newChatButton: [
      'a[href*="/new"]',
      'button:has-text("Start new chat")',
      'div[role="button"]:has-text("New")'
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

  function startStreaming(messageElement) {
    if (streamingInterval) return; // Already streaming

    isCurrentlyStreaming = true;
    lastStreamedContent = '';
    console.log('[CS claude] 🌊 Started streaming updates');

    // Send streaming updates every 500ms
    streamingInterval = setInterval(() => {
      const currentContent = extractMessageText(messageElement);

      // Only send if content changed
      if (currentContent !== lastStreamedContent) {
        lastStreamedContent = currentContent;

        if (port && currentContent) {
          port.postMessage({
            type: 'MESSAGE_STREAMING',
            platform: 'claude',
            content: currentContent,
            sessionId: currentSessionId,
            isComplete: false
          });
          console.log('[CS claude] 📡 Streaming update, length:', currentContent.length);
        }
      }
    }, 500);
  }

  function stopStreaming() {
    if (streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
      isCurrentlyStreaming = false;
      lastStreamedContent = '';
      console.log('[CS claude] ⏹ Stopped streaming');
    }
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

      const lastMessage = claudeMessages[claudeMessages.length - 1];
      const stopButton = findElement(SELECTORS.stopButton);
      const isStreaming = lastMessage.getAttribute('data-is-streaming');

      // Check if still generating
      if ((stopButton && stopButton.offsetParent !== null) || isStreaming === 'true') {
        // Still generating - start or continue streaming
        if (!isCurrentlyStreaming) {
          console.log('[CS claude] 🎬 Message generating, starting stream');
          startStreaming(lastMessage);
        }
        return;
      }

      // Generation complete
      stopStreaming();

      const text = extractMessageText(lastMessage);

      if (text && text.length > 0) {
        console.log('[CS claude] ✓ Complete message ready, length:', text.length);
        console.log('[CS claude] Message preview:', text.slice(0, 200));

        lastMessageCount = claudeMessages.length;

        // Send final complete message
        if (port) {
          const message = {
            type: 'NEW_MESSAGE',
            platform: 'claude',
            content: text,
            sessionId: currentSessionId,
            isComplete: true
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
  // Sending Prompts and Chat Management
  // ============================================================================

  function startNewChat() {
    console.log('[CS claude] Starting new chat...');

    // Reset message tracking
    lastMessageCount = 0;
    isProcessing = false;
    currentSessionId = null;

    // Try to find and click the "New Chat" button/link
    const newChatBtn = findElement(SELECTORS.newChatButton);
    if (newChatBtn) {
      console.log('[CS claude] Found new chat button, clicking...');
      newChatBtn.click();
    } else {
      // Fallback: navigate to new chat page
      console.log('[CS claude] New chat button not found, navigating to new chat...');
      window.location.href = 'https://claude.ai/new';
    }
  }

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
