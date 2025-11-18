// Lightweight HTML to Markdown converter
// Converts HTML elements to Markdown format for better readability

(function() {
  'use strict';

  function htmlToMarkdown(element) {
    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true);

    // Remove unwanted elements (buttons, etc.)
    const unwanted = clone.querySelectorAll('button, [aria-hidden="true"], .sr-only');
    unwanted.forEach(el => el.remove());

    // Convert to markdown
    return convertNode(clone);
  }

  function convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim();
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    let result = '';

    // Handle different HTML elements
    switch (tag) {
      case 'h1':
        result = '# ' + getTextContent(node) + '\n\n';
        break;

      case 'h2':
        result = '## ' + getTextContent(node) + '\n\n';
        break;

      case 'h3':
        result = '### ' + getTextContent(node) + '\n\n';
        break;

      case 'h4':
        result = '#### ' + getTextContent(node) + '\n\n';
        break;

      case 'h5':
        result = '##### ' + getTextContent(node) + '\n\n';
        break;

      case 'h6':
        result = '###### ' + getTextContent(node) + '\n\n';
        break;

      case 'p':
        result = convertChildren(node) + '\n\n';
        break;

      case 'br':
        result = '\n';
        break;

      case 'strong':
      case 'b':
        result = '**' + getTextContent(node) + '**';
        break;

      case 'em':
      case 'i':
        result = '_' + getTextContent(node) + '_';
        break;

      case 'code':
        // Check if it's an inline code or code block
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
          // This is handled by the 'pre' case
          return getTextContent(node);
        } else {
          // Inline code
          result = '`' + getTextContent(node) + '`';
        }
        break;

      case 'pre':
        const codeElement = node.querySelector('code');
        const code = codeElement ? getTextContent(codeElement) : getTextContent(node);
        const language = codeElement ? getCodeLanguage(codeElement) : '';
        result = '\n```' + language + '\n' + code + '\n```\n\n';
        break;

      case 'ul':
        result = convertList(node, false) + '\n';
        break;

      case 'ol':
        result = convertList(node, true) + '\n';
        break;

      case 'li':
        // Handled by convertList
        result = convertChildren(node);
        break;

      case 'a':
        const href = node.getAttribute('href') || '';
        const text = getTextContent(node);
        result = '[' + text + '](' + href + ')';
        break;

      case 'blockquote':
        const lines = convertChildren(node).split('\n');
        result = lines.map(line => line.trim() ? '> ' + line : '').join('\n') + '\n\n';
        break;

      case 'hr':
        result = '\n---\n\n';
        break;

      case 'table':
        result = convertTable(node) + '\n\n';
        break;

      case 'img':
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        result = '![' + alt + '](' + src + ')';
        break;

      case 'div':
      case 'span':
      case 'article':
      case 'section':
        // Just process children
        result = convertChildren(node);
        break;

      default:
        // For other elements, just get the children
        result = convertChildren(node);
    }

    return result;
  }

  function convertChildren(node) {
    let result = '';
    for (const child of node.childNodes) {
      result += convertNode(child);
    }
    return result;
  }

  function getTextContent(node) {
    return node.textContent.trim();
  }

  function getCodeLanguage(codeElement) {
    // Try to detect language from class names
    const classes = codeElement.className.split(' ');
    for (const cls of classes) {
      if (cls.startsWith('language-')) {
        return cls.replace('language-', '');
      }
      if (cls.startsWith('lang-')) {
        return cls.replace('lang-', '');
      }
    }
    return '';
  }

  function convertList(listNode, ordered) {
    const items = Array.from(listNode.children).filter(child =>
      child.tagName.toLowerCase() === 'li'
    );

    return items.map((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      const content = convertChildren(item).trim();
      return prefix + content;
    }).join('\n');
  }

  function convertTable(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    let result = '';

    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const cellContents = cells.map(cell => getTextContent(cell).replace(/\|/g, '\\|'));
      result += '| ' + cellContents.join(' | ') + ' |\n';

      // Add separator after header row
      if (rowIndex === 0) {
        result += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
      }
    });

    return result;
  }

  // Export to global scope
  window.htmlToMarkdown = htmlToMarkdown;

})();
