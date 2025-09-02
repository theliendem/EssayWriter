# EssayPro - Ultimate Essay Writing Platform

A comprehensive essay writing platform with AI assistance, real-time statistics, formatting tools, and seamless document management.

## Features

### 📝 Rich Text Editor
- Clean, distraction-free writing environment
- Real-time formatting with bold, italic, underline
- Heading support (H1, H2, H3)
- Auto-save functionality

### 📊 Real-Time Statistics
- Word count, character count, sentence count, paragraph count
- Selection-based statistics (select text to see stats for selection)
- Live updates as you type

### 🤖 AI Integration
- Built-in AI chatbot for writing assistance
- **Enhanced AI content detector** using GPTZero-style analysis
- Advanced AI humanizer with detailed suggestions
- No API keys required - works completely offline

### 💾 Document Management
- Save essays to SQLite database
- Load and manage multiple essays
- Auto-save every 30 seconds
- Google Docs-like experience

### 🎨 Beautiful UI
- Dark/Light mode toggle
- Gradient design with smooth animations
- Responsive layout
- Clean, modern interface

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Check Python setup (optional for enhanced AI detection):**
   ```bash
   npm run setup
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

### Enhanced AI Detection

The platform includes a sophisticated AI detector based on GPTZero methodology:

- **With Python 3**: Advanced perplexity analysis, burstiness detection, and pattern recognition
- **Without Python**: Fallback to heuristic-based detection (still very effective)
- **No API keys needed**: Everything runs locally

To test the enhanced detection:
```bash
npm run test-ai
```

## Development

For development with auto-reload:
```bash
npm run dev
```

## Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite3
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **AI:** Hugging Face Inference API (free tier)
- **Styling:** Custom CSS with CSS Variables for theming

## API Endpoints

- `GET /api/essays` - Get all essays
- `POST /api/essays` - Create new essay
- `PUT /api/essays/:id` - Update essay
- `DELETE /api/essays/:id` - Delete essay
- `POST /api/chat` - AI chat assistance

## Features in Detail

### AI Assistant
The integrated chatbot helps with:
- Writing suggestions and improvements
- Grammar and style advice
- Content ideas and structure
- Research assistance

### AI Tools
- **Enhanced AI Detector:** 
  - Uses GPTZero-style perplexity analysis
  - Measures burstiness (sentence variation)
  - Analyzes vocabulary diversity and repetition patterns
  - Provides detailed metrics and explanations
  - Fallback mode if Python unavailable
- **Advanced Humanizer:** 
  - Analyzes sentence structure and variety
  - Detects repetitive patterns and overused words
  - Suggests natural language improvements
  - Provides specific, actionable feedback

### Statistics Panel
Real-time tracking of:
- Word count (updates as you type)
- Character count (including spaces)
- Sentence count (based on punctuation)
- Paragraph count (based on line breaks)

### Formatting Tools
- Bold, italic, underline text formatting
- Heading levels (H1, H2, H3)
- Clean paragraph structure
- Rich text editing with contenteditable

## Customization

### Themes
The platform supports light and dark themes with CSS variables. Modify the `:root` and `[data-theme="dark"]` sections in `public/styles.css` to customize colors.

### AI Integration
Currently uses Hugging Face's free inference API. To use other AI services:
1. Update the `/api/chat` endpoint in `server.js`
2. Add your API keys to environment variables
3. Modify the request format as needed

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues or questions, please create an issue in the repository.