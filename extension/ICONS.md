# Extension Icons

The extension requires three icon sizes referenced in `manifest.json`:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

## Quick Solution: Create Icons Online

You can create icons quickly using online tools:

1. **Method 1: Use Favicon Generator**
   - Visit https://favicon.io/favicon-generator/
   - Create a simple icon (suggested: "G↔C" text or robot emoji 🤖)
   - Download the generated icons
   - Rename them to match the required sizes

2. **Method 2: Use Canva**
   - Visit https://www.canva.com
   - Create designs with dimensions: 16x16, 48x48, 128x128
   - Export as PNG
   - Save to the extension folder

3. **Method 3: Simple Placeholder (for testing)**
   - The extension will work without icons (Chrome shows a default icon)
   - You can add icons later

## Design Suggestions

### Concept Ideas
- Two speech bubbles facing each other (representing discussion)
- Robot faces side by side
- "G↔C" text with arrows
- Chat/message icon with dual colors

### Color Scheme
- Use the extension's gradient colors:
  - Primary: #667eea (purple-blue)
  - Secondary: #764ba2 (purple)
- Or use brand colors:
  - ChatGPT: Blue/teal
  - Claude: Orange/coral

## Creating Icons Programmatically

If you have ImageMagick installed, you can create simple placeholder icons:

```bash
# Create a simple colored square with text
convert -size 128x128 xc:'#667eea' -gravity center -pointsize 60 -fill white -annotate +0+0 'GC' icon128.png

# Resize for other sizes
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

## Using SVG (Alternative)

You can also use SVG icons in the manifest:

```json
"icons": {
  "16": "icon.svg",
  "48": "icon.svg",
  "128": "icon.svg"
}
```

Create `icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="url(#grad)"/>
  <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="48" fill="white" font-family="Arial, sans-serif" font-weight="bold">G↔C</text>
</svg>
```

## Temporary Workaround

If you want to test the extension immediately without creating icons:

1. Comment out the icons section in `manifest.json`:

```json
// "icons": {
//   "16": "icon16.png",
//   "48": "icon48.png",
//   "128": "icon128.png"
// }
```

2. The extension will use Chrome's default puzzle piece icon

## Recommended: Free Icon Resources

Download free icons from:
- https://www.flaticon.com (search "chat", "discussion", "robot")
- https://icons8.com
- https://www.iconfinder.com

Download in multiple sizes or use an SVG that scales automatically.
