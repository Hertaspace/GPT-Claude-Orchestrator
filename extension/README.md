# GPT-Claude Orchestrator

A Chrome extension that orchestrates multi-round discussions between ChatGPT and Claude to provide comprehensive answers to your questions.

## Features

- **Multi-Round Discussions**: Facilitates iterative discussions between ChatGPT and Claude
- **Automatic Orchestration**: Manages the conversation flow automatically
- **Real-Time Monitoring**: Watch the discussion unfold in real-time
- **Final Summary**: ChatGPT provides a consolidated final answer incorporating insights from both models
- **Status Markers**: Models indicate when they're ready to conclude the discussion
- **Beautiful UI**: Clean, modern interface with color-coded messages

## How It Works

1. **You ask a question** in the dashboard
2. **Initial Round**: Both ChatGPT and Claude independently answer your question
3. **Discussion Rounds**: The models exchange critiques and refine their answers (up to 5 rounds)
4. **Status Markers**: Each model indicates if it wants to continue (`<<DISCUSS>>`) or if it's ready to summarize (`<<READY_TO_SUMMARIZE>>`)
5. **Final Summary**: ChatGPT produces a final answer incorporating the best insights from both models

## Installation

### Prerequisites

- Chrome, Edge, or any Chromium-based browser
- Active accounts for:
  - ChatGPT (https://chat.openai.com)
  - Claude (https://claude.ai)

### Steps

1. **Download the Extension**
   - Clone or download this repository
   - Locate the `extension` folder

2. **Load the Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `extension` folder
   - The extension icon should appear in your toolbar

3. **Verify Installation**
   - Click the extension icon to open the dashboard
   - You should see the "GPT-Claude Orchestrator" interface

## Usage

### Basic Workflow

1. **Open Required Tabs**
   - Open ChatGPT in one tab: https://chat.openai.com
   - Open Claude in another tab: https://claude.ai
   - Make sure you're logged in to both

2. **Open the Dashboard**
   - Click the extension icon in your toolbar
   - Or right-click the icon and select "Open Dashboard"

3. **Start a Discussion**
   - Enter your question in the text area
   - Click "Start Discussion" (or press Ctrl/Cmd+Enter)

4. **Watch the Discussion**
   - The dashboard will show all messages in real-time:
     - **Green**: Your question
     - **Blue**: ChatGPT's responses
     - **Pink**: Claude's responses
     - **Yellow**: Final summary

5. **Review Results**
   - The final summary will appear at the end
   - You can scroll through the entire discussion history

### Tips for Best Results

1. **Ask Clear Questions**: The more specific your question, the better the discussion
2. **Complex Problems**: The orchestrator works best with problems that benefit from multiple perspectives
3. **Keep Tabs Open**: Don't close the ChatGPT or Claude tabs during a discussion
4. **Wait for Completion**: Let the discussion finish before starting a new one

## Configuration

The extension has several configurable parameters in `background.js`:

```javascript
const CONFIG = {
  MAX_ROUNDS: 5,                  // Maximum discussion rounds
  RESPONSE_TIMEOUT: 90000,        // 90 seconds timeout per response
  DISCUSS_MARKER: '<<DISCUSS>>',  // Continue discussion marker
  READY_MARKER: '<<READY_TO_SUMMARIZE>>' // Ready to summarize marker
};
```

## Troubleshooting

### Extension Not Working

1. **Refresh Extension**
   - Go to `chrome://extensions/`
   - Click the refresh icon on the GPT-Claude Orchestrator card

2. **Check Console Logs**
   - Open DevTools (F12) on the dashboard
   - Check the Console tab for errors

3. **Verify Tabs**
   - Ensure ChatGPT and Claude tabs are open and logged in
   - Try refreshing both tabs

### Messages Not Detected

1. **DOM Changes**: ChatGPT and Claude update their UIs frequently
   - The content scripts use multiple selector strategies for robustness
   - If detection fails, the DOM selectors may need updating

2. **Update Selectors**
   - Open DevTools on ChatGPT/Claude pages
   - Inspect the message elements
   - Update selectors in `chatgpt_content.js` or `claude_content.js`

### Timeout Errors

- Increase `RESPONSE_TIMEOUT` in `background.js` if models are slow to respond
- Check your internet connection
- Ensure the model pages aren't experiencing issues

## Technical Architecture

### Components

1. **manifest.json**: Extension configuration (Manifest V3)
2. **background.js**: Service worker managing orchestration logic
3. **chatgpt_content.js**: Content script for ChatGPT DOM interaction
4. **claude_content.js**: Content script for Claude DOM interaction
5. **dashboard.html**: User interface
6. **dashboard.js**: Dashboard logic and messaging

### Communication Flow

```
Dashboard ←→ Background Service Worker ←→ Content Scripts
                                              ↓
                                         ChatGPT & Claude
                                         (Web UIs)
```

All communication uses Chrome's messaging API (`chrome.runtime.connect` and ports).

## Discussion Protocol

### Initial Prompt Template

Both models receive:
- The user's question
- Instructions to provide their own answer
- Request to include a status marker (`<<DISCUSS>>` or `<<READY_TO_SUMMARIZE>>`)

### Discussion Prompt Template

Each model receives:
- The original question
- The other model's latest answer
- Their own previous answer
- Instructions to critique and refine

### Final Summary Prompt

ChatGPT receives:
- The original question
- Both final discussion answers
- Instructions to produce a consolidated summary

## Limitations

1. **Web UI Dependent**: Relies on the current structure of ChatGPT and Claude web interfaces
2. **No API Access**: Does not use official APIs (works entirely through web UIs)
3. **Manual Login**: Users must be logged in to both services
4. **DOM Changes**: May break if ChatGPT or Claude significantly change their DOM structure
5. **Single Session**: Only one discussion at a time

## Privacy & Security

- **No Data Collection**: The extension does not collect or transmit any data
- **Local Processing**: All orchestration happens locally in your browser
- **No External Servers**: No communication with external servers except ChatGPT and Claude
- **Open Source**: All code is visible and auditable

## Future Enhancements

Potential improvements:
- Support for more models (Gemini, etc.)
- Configurable discussion rounds per session
- Export conversation to file
- Custom prompt templates
- Parallel initial responses
- Discussion branching

## License

This project is provided as-is for educational and personal use.

## Contributing

Contributions are welcome! Areas that may need updates:
- DOM selectors for ChatGPT and Claude (as their UIs change)
- Prompt templates for better discussions
- UI improvements
- Additional features

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Review browser console logs
3. Open an issue on GitHub with:
   - Your browser version
   - Extension version
   - Console error messages
   - Steps to reproduce

---

**Note**: This extension is not affiliated with OpenAI or Anthropic. It's an independent tool that interfaces with their web applications.
