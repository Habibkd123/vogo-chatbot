# Vogo Chatbot - Phase A

A JavaScript chatbot widget with predefined Q&A navigation and multilingual support.

## Features

- ✅ Predefined Q&A navigation with parent_id tree structure
- ✅ Multilingual support (EN, RO, IT, FR, DE)
- ✅ Secure backend proxy (no credentials in frontend)
- ✅ Beautiful Hostinger-style UI
- ✅ WordPress REST API integration

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` file:
```env
VOGO_USERNAME=emp.mobile.generale@vogo.family
VOGO_PASSWORD=Abcd1234
VOGO_API_BASE=https://vogo.family/wp-json/vogo/v1
SERVER_PORT=3000
SHOW_DETAILED_LOGS=false
```

Set `SHOW_DETAILED_LOGS=true` to enable detailed console logs and persistent logs in `/logs`.
Logs are stored locally in `logs/server-logs.db` (SQLite).

### 3. Start Server
```bash
npm start
```

Server runs at: `http://localhost:3000`

### 4. Test
Open `public/test.html` in your browser.

## Integration

Add to your website:
```html
<link rel="stylesheet" href="chatbot.css">
<script src="chatbot.js"></script>
```

The chatbot will appear as a purple bubble in the bottom-right corner.

## How It Works

1. **Click purple bubble** → Chat opens
2. **Predefined questions load** from API: `/wp-json/vogo/v1/predefined_qa`
3. **Click a question** → Loads sub-questions (parent_id system)
4. **Navigate through tree** → Until reaching final answer/link

## API Endpoints

### Backend Proxy
- `POST /api/chatbot` - Main chatbot API endpoint
- `GET /health` - Server health check
- `GET /` - Test dashboard

### WordPress API (via proxy)
- `POST /predefined_qa` - Get questions by parent_id

## File Structure
```
vogo-chatbot/
├── src/
│   ├── ui/chatbot.css        # Styles
│   ├── chatbot.js            # Main chatbot
│   └── config/
│       └── chatbot.config.js # Configuration
├── server/
│   └── server.js             # Backend proxy
├── public/
│   ├── chatbot.css           # CSS for deployment
│   └── test.html             # Test page
├── .env                      # Environment variables
├── package.json
└── README.md
```

## Configuration

Edit `src/chatbot.js`:
```javascript
const CONFIG = {
  proxyUrl: 'http://localhost:3000/api/chatbot',
  botName: 'Kodee',
  defaultLanguage: 'ro',
  baseWebsiteUrl: 'https://vogo.family'
};
```

## Language Support

Switch languages using buttons in chat header:
- 🇬🇧 English (EN)
- 🇷🇴 Romanian (RO) - Default
- 🇮🇹 Italian (IT)
- 🇫🇷 French (FR)
- 🇩🇪 German (DE)

## Security

- ✅ All API credentials stored server-side
- ✅ JWT token managed by backend
- ✅ No sensitive data in frontend JavaScript
- ✅ CORS properly configured

## Troubleshooting

### Server won't start
```bash
npm install
# Make sure .env file exists
```

### Questions not loading
- Check backend server is running
- Verify API credentials in `.env`
- Check browser console for errors

### Links show 404
This is expected if product pages don't exist on the website yet. The chatbot is working correctly - URLs are properly formatted. The client needs to create the product pages.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## What's Next (Phase B)

Phase B will add:
- NLP intent detection
- Free text understanding
- Search functionality
- Shopping list integration
- Agenda features

## Support

For issues or questions:
- Check server logs in terminal
- Open browser console (F12) for errors
- Test at: `http://localhost:3000`

## License

Proprietary - Vogo Family © 2025

---

**Built with ❤️ for Vogo Family**