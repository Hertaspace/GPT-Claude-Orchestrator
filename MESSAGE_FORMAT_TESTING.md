# Message Format Testing Guide

## What Changed

The extension now extracts messages using **HTML to Markdown conversion** instead of plain text extraction. This preserves formatting like:

- ✅ **Bold** and _italic_ text
- ✅ Code blocks with syntax highlighting
- ✅ Lists (ordered and unordered)
- ✅ Links
- ✅ Headings
- ✅ Tables
- ✅ Blockquotes

## How to Test

### 1. Prepare Test Question

Use a question that will generate formatted responses:

```
请用以下格式回答：
1. 标题（使用 ## 标记）
2. 代码示例（使用代码块）
3. 列表
4. 加粗和斜体文本

问题：如何在 JavaScript 中创建一个简单的 HTTP 服务器？
```

### 2. Start a Discussion

1. **Refresh extension**: `chrome://extensions/` → Refresh
2. **Open ChatGPT**: https://chat.openai.com
3. **Open Claude**: https://claude.ai
4. **Open Dashboard**: Click extension icon
5. **Enter test question** and click "Start Discussion"

### 3. Check Message Format

When messages appear in the dashboard log section:

#### ✅ Good Format (Expected)
```markdown
## 创建 HTTP 服务器

以下是创建 HTTP 服务器的步骤：

1. 导入 http 模块
2. 创建服务器
3. 监听端口

**示例代码：**

\`\`\`javascript
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
});

server.listen(3000);
\`\`\`

_注意：需要 Node.js 环境_
```

#### ❌ Bad Format (Old Behavior)
```
创建 HTTP 服务器 以下是创建 HTTP 服务器的步骤： 导入 http 模块 创建服务器 监听端口 示例代码： const http = require('http'); const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type': 'text/plain'}); res.end('Hello World\n'); }); server.listen(3000); 注意：需要 Node.js 环境
```

### 4. Check Console Logs

In ChatGPT/Claude console (F12), you should see:

```
[CS chatgpt] Using HTML to Markdown converter
[CS chatgpt] Extracted text length: 450
```

Or if there's an issue:
```
[CS chatgpt] HTML to Markdown not available, using innerText
```

### 5. Compare Formats

**Test these specific elements:**

#### Test 1: Code Block
Ask: "Show me a Python function to calculate factorial"

Expected: Code block with proper formatting
```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

#### Test 2: Lists
Ask: "List 3 benefits of using TypeScript"

Expected:
```markdown
1. Static type checking
2. Better IDE support
3. Improved code maintainability
```

#### Test 3: Bold/Italic
Ask: "Explain the difference between let and var, emphasize the key point"

Expected: Text with **bold** for emphasis

#### Test 4: Table
Ask: "Create a comparison table of Array methods: map, filter, reduce"

Expected: Proper markdown table:
```markdown
| Method | Purpose | Returns |
| --- | --- | --- |
| map | Transform elements | New array |
| filter | Select elements | New array |
| reduce | Aggregate | Single value |
```

## Debugging

### If formats are still bad:

1. **Check console logs**:
   - Open ChatGPT tab → F12 → Console
   - Look for: `[CS chatgpt] Using HTML to Markdown converter`
   - If you see "not available", the converter didn't load

2. **Check manifest.json**:
   ```json
   "content_scripts": [
     {
       "matches": ["https://chat.openai.com/*", "https://chatgpt.com/*"],
       "js": ["html-to-markdown.js", "chatgpt_content.js"],
       ...
     }
   ]
   ```
   Make sure `html-to-markdown.js` is listed FIRST

3. **Verify file exists**:
   - Check that `/extension/html-to-markdown.js` exists
   - File should be ~200 lines

4. **Test converter manually**:
   Open ChatGPT console and run:
   ```javascript
   typeof window.htmlToMarkdown
   // Should output: "function"

   window.htmlToMarkdown(document.body)
   // Should output markdown text
   ```

## Known Limitations

1. **Very complex HTML** might not convert perfectly
2. **Custom widgets** (charts, interactive elements) will be converted to text
3. **Images** are converted to `![alt](src)` markdown syntax
4. **Inline styles** are ignored (only semantic HTML is converted)

## Fallback Behavior

If HTML to Markdown conversion fails for any reason, the extension automatically falls back to plain text extraction (`innerText`). You'll see this in the console:

```
[CS chatgpt] HTML to Markdown conversion failed, falling back to innerText: Error...
```

This ensures the extension continues working even if there are edge cases.

## Success Criteria

The format improvement is working if:

- ✅ Code blocks are preserved with ` ```language ` markers
- ✅ Lists maintain numbering/bullets
- ✅ Bold/italic formatting visible as `**text**` and `_text_`
- ✅ Headings prefixed with `#`
- ✅ Links in `[text](url)` format
- ✅ Tables render as markdown tables

If all these work, the format quality is significantly improved! 🎉
