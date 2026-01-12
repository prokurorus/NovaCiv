# ✅ TELEGRAM NEWS FEED DESIGN IMPLEMENTATION

**Date:** 2026-01-11  
**Feature:** Enhanced Telegram news feed with images and NovaCiv brand inserts

---

## 📋 CHANGES SUMMARY

### Files Modified:
1. `netlify/functions/fetch-news.js` - Added image extraction from RSS
2. `netlify/functions/news-cron.js` - Added photo sending, brand inserts, inline keyboards

---

## 🎨 POST FORMAT

### A) News Post with Image

**Format (when imageUrl exists):**
- **Type:** Photo post (`sendPhoto`)
- **Photo:** Image from RSS (enclosure/media:thumbnail/og:image)
- **Caption:**
  ```
  <b>News Title</b>
  
  Brief content (first 200 chars or first paragraph)...
  
  <a href="SOURCE_LINK">Источник</a> • <a href="https://novaciv.space">NovaCiv</a>
  ```
- **Inline Keyboard:**
  - Button 1: "Источник" → originalLink
  - Button 2: "NovaCiv" → https://novaciv.space

**Format (when no imageUrl):**
- **Type:** Text post (`sendMessage`)
- **Content:** Full text with link preview enabled
- **Text:**
  ```
  Full content text...
  
  — NovaCiv movement
  Tagline...
  Источник: SOURCE_LINK
  https://novaciv.space/news
  ```
- **Inline Keyboard:** Same as above

---

### B) NovaCiv Brand Insert

**Frequency:** Every 3 news posts (after 1st, 4th, 7th, etc.)

**Format:**
- **Type:** Photo post (`sendPhoto`)
- **Photo:** https://novaciv.space/og-image.png
- **Caption (language-specific):**
  - RU: "Цифровое сообщество без правителей — только граждане.\n\nNovaCiv"
  - EN: "Digital community without rulers — only citizens.\n\nNovaCiv"
  - DE: "Digitale Gemeinschaft ohne Herrscher – nur Bürger.\n\nNovaCiv"
- **Inline Keyboard:**
  - Button: "Перейти на сайт" / "Visit Website" / "Zur Website" → https://novaciv.space

---

## 🖼️ IMAGE URL EXTRACTION

**Source:** RSS feed parsing in `fetch-news.js`

**Extraction Order (priority):**
1. `<enclosure>` tag with `type="image/..."` → `url` attribute
2. `<media:thumbnail>` or `<media:content>` → `url` attribute
3. `<og:image>` meta tag in description HTML
4. First `<img src="...">` tag in description HTML

**Storage:**
- Saved to Firebase topic: `imageUrl` field (optional, can be empty)

**Example RSS fields:**
```xml
<item>
  <enclosure url="https://example.com/image.jpg" type="image/jpeg"/>
  <!-- OR -->
  <media:thumbnail url="https://example.com/thumb.jpg"/>
  <!-- OR in description -->
  <description>
    <![CDATA[
      <img src="https://example.com/image.jpg"/>
    ]]>
  </description>
</item>
```

---

## 🔄 BRAND INSERT LOGIC

**Frequency:** Every 3 posts (configurable via `BRAND_INSERT_INTERVAL`)

**Logic:**
- After 1st news post → brand insert
- After 4th news post → brand insert
- After 7th news post → brand insert
- etc.

**Implementation:**
```javascript
const shouldSendBrandInsert = postCount > 1 && (postCount - 1) % BRAND_INSERT_INTERVAL === 0;
```

**Send Behavior:**
- Sent to ALL configured channels (RU/EN/DE) simultaneously
- Language-specific caption and button text
- 500ms delay after brand insert before next news post

---

## 🛡️ FALLBACK BEHAVIOR

### If Image URL Missing:
- Falls back to text post automatically
- Full content sent as text message
- Link preview enabled

### If Image URL Invalid/Broken:
- Telegram API returns error (400/404)
- Automatically falls back to text post
- Error logged, but pipeline continues
- No exception thrown

**Implementation:**
```javascript
// In sendPhotoToTelegram:
if (!data.ok && (data.error_code === 400 || data.error_code === 404)) {
  log("Photo send failed, falling back to text:", data.description);
  return sendTextToTelegram(chatId, caption, replyMarkup);
}
```

---

## 🔧 TECHNICAL DETAILS

### Telegram API Limits:
- **Caption length:** Max 1024 characters (implementation keeps < 300)
- **Photo URL:** Must be publicly accessible
- **Parse mode:** HTML (escaped for safety)
- **Inline keyboard:** Max 100 buttons (we use 1-2 buttons)

### Data Model Extension:
**Firebase topic structure (backward compatible):**
```json
{
  "title": "...",
  "content": "...",
  "section": "news",
  "lang": "en|ru|de",
  "originalLink": "https://...",
  "imageUrl": "https://...",  // NEW (optional)
  "telegramPostedAt": 1234567890
}
```

### Channel Distribution:
- News posts sent to ALL configured channels (RU/EN/DE)
- Brand inserts sent to ALL configured channels
- Caption language matches `topic.lang` field

---

## 📊 POST FLOW EXAMPLE

**Sequence (5 news posts):**
1. News Post #1 (RU, with image)
2. **Brand Insert** (all channels)
3. News Post #2 (EN, no image → text)
4. News Post #3 (DE, with image)
5. **Brand Insert** (all channels)
6. News Post #4 (RU, with image)
7. News Post #5 (EN, with image)

---

## ✅ BACKWARD COMPATIBILITY

- ✅ Old topics without `imageUrl` work (fallback to text)
- ✅ `telegramPostedAt` marking unchanged
- ✅ Health metrics unchanged
- ✅ Error handling preserved
- ✅ Existing topics continue to work

---

## 🔍 WHAT TO CHECK IN TELEGRAM

After deployment, verify:

1. **News Posts:**
   - [ ] Posts with images show photos (when imageUrl exists)
   - [ ] Posts without images show as text
   - [ ] Caption format is correct (title, brief content, links)
   - [ ] Inline keyboard buttons work ("Источник", "NovaCiv")
   - [ ] Links are clickable

2. **Brand Inserts:**
   - [ ] Appear every 3 posts
   - [ ] Show og-image.png photo
   - [ ] Caption is language-appropriate
   - [ ] Button text matches language
   - [ ] Button links to https://novaciv.space

3. **Fallback:**
   - [ ] Broken image URLs fall back to text (no errors)
   - [ ] Posts without imageUrl work normally
   - [ ] Pipeline continues on errors

4. **Language Channels:**
   - [ ] All news posts go to all configured channels (RU/EN/DE)
   - [ ] Brand inserts go to all configured channels

---

## 📝 COMMIT & DEPLOYMENT

**Commit message:** `feat: enhance Telegram news feed with images and brand inserts`

**Files changed:**
- `netlify/functions/fetch-news.js` - Image extraction from RSS
- `netlify/functions/news-cron.js` - Photo sending, brand inserts, keyboards

**Deployment:**
- Push to `main` → Netlify auto-deploy
- Functions will update automatically
- No database migration needed (imageUrl is optional)

**Verification:**
- Wait for next news-cron run (every hour at :00)
- Check Telegram channels for new format
- Verify brand inserts appear every 3 posts

---

## 🎯 EXPECTED RESULT

**Before:**
- Plain text posts
- No images
- No brand promotion
- Basic formatting

**After:**
- Rich photo posts (when images available)
- Brand inserts every 3 posts
- Inline keyboard buttons for navigation
- Professional "magazine-style" feed
- Fallback to text if images unavailable

---

**Status:** ✅ Implementation Complete  
**Ready for:** Testing and deployment
