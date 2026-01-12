# ✅ TELEGRAM VISUALS RESTORE REPORT

**Date:** 2026-01-11  
**Commit:** `95ae3c9`  
**Message:** `feat: restore telegram news visuals (rss images + NovaCiv insert)`

---

## 📋 SUMMARY

Restored visual elements in Telegram news feed:
- ✅ RSS images attached to news posts
- ✅ NovaCiv brand inserts between news items
- ✅ Inline keyboard buttons for navigation
- ✅ Safe fallback to text if images unavailable

---

## 📁 FILES CHANGED

### 1. `netlify/functions/fetch-news.js`

**Functions Modified:**
- `parseRss()` - Added image extraction from RSS feeds

**Changes:**
- Extract `imageUrl` from RSS items:
  - `<enclosure type="image/...">` → `url` attribute
  - `<media:thumbnail>` or `<media:content>` → `url` attribute
  - `<og:image>` meta tag in description HTML
  - First `<img src="...">` tag in description HTML
- Store `imageUrl` in parsed item object

**Function:** `saveNewsToForumLang()`
- Save `imageUrl` field to Firebase topic (optional field)

**Lines Changed:** +35 lines

---

### 2. `netlify/functions/news-cron.js`

**Functions Added:**
- `sendTextToTelegram()` - Text message sending with keyboard support
- `sendPhotoToTelegram()` - Photo sending with automatic fallback to text
- `buildPostCaption()` - Short caption format for photo posts
- `buildNewsKeyboard()` - Inline keyboard for news posts
- `buildBrandKeyboard()` - Inline keyboard for brand inserts
- `getBrandCaption()` - Language-specific brand captions
- `escapeHtml()` - HTML escaping for safe caption formatting

**Functions Modified:**
- `buildPostText()` - Updated text format (backward compatible)
- Main `handler()` - Added photo sending logic and brand insert logic

**Changes:**
- Send photo posts when `imageUrl` exists (with caption)
- Send text posts when `imageUrl` is missing
- Automatic fallback from photo to text if image fails to load
- Brand insert every 3 posts (max 1 per run)
- Inline keyboard buttons ("Источник", "NovaCiv")
- HTML parse mode for captions (safe escaping)

**Lines Changed:** +222 lines

---

## 🖼️ RSS IMAGE DETECTION

**Source:** RSS feed XML parsing in `fetch-news.js::parseRss()`

**Detection Priority:**
1. **`<enclosure>` tag:**
   ```xml
   <enclosure url="https://example.com/image.jpg" type="image/jpeg"/>
   ```
   - Checks `type` attribute starts with "image/"
   - Extracts `url` attribute

2. **`<media:thumbnail>` or `<media:content>`:**
   ```xml
   <media:thumbnail url="https://example.com/thumb.jpg"/>
   ```
   - Extracts `url` attribute from media tags

3. **OpenGraph image in description:**
   ```xml
   <description>
     <![CDATA[
       <meta property="og:image" content="https://example.com/image.jpg"/>
     ]]>
   </description>
   ```
   - Regex: `<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`

4. **First `<img>` tag in description:**
   ```xml
   <description>
     <![CDATA[
       <img src="https://example.com/image.jpg"/>
     ]]>
   </description>
   ```
   - Regex: `<img[^>]+src=["']([^"']+)["']`

**Storage:**
- Saved to Firebase: `topic.imageUrl` (optional field, empty string if not found)
- Backward compatible (old topics without `imageUrl` still work)

---

## 🎯 BRAND INSERT CADENCE

**Rule:** Insert after every 3 news posts, maximum 1 insert per cron run

**Logic:**
```javascript
const BRAND_INSERT_INTERVAL = 3;
let brandInsertSent = false;

for (const topic of freshTopics) {
  postCount++;
  
  // Insert after 3rd, 6th, 9th post, but max 1 per run
  const shouldSendBrandInsert = 
    !brandInsertSent && 
    postCount > 1 && 
    (postCount - 1) % BRAND_INSERT_INTERVAL === 0;
  
  if (shouldSendBrandInsert) {
    brandInsertSent = true; // Max 1 per run
    // Send brand insert...
  }
  
  // Send news post...
}
```

**Examples:**
- **1-3 posts:** Insert after 3rd post (if run has 3+ posts)
- **4-6 posts:** Insert after 3rd post only (first insert), not after 6th
- **7+ posts:** Insert after 3rd post only (max 1 per run)

**Conditions:**
- ✅ Only if `freshTopics.length > 0` (no insert if no news)
- ✅ Maximum 1 insert per cron run
- ✅ Sent to all configured channels (RU/EN/DE) simultaneously

---

## 📱 TELEGRAM POST FORMAT

### News Post (with image)

**Type:** Photo post (`sendPhoto`)

**Photo:** RSS image (if available)

**Caption:**
```
<b>News Title</b>

Brief summary text (first 200 chars or first paragraph)...

<a href="SOURCE_URL">Источник</a> • <a href="https://novaciv.space">NovaCiv</a>
```

**Inline Keyboard:**
```
[Источник] [NovaCiv]
```

**Fallback (no image):**
- Type: Text post (`sendMessage`)
- Full content with link preview enabled
- Same inline keyboard

---

### NovaCiv Brand Insert

**Type:** Photo post (`sendPhoto`)

**Photo:** `https://novaciv.space/og-image.png`

**Caption (language-specific):**
- **RU:** `Цифровое сообщество без правителей — только граждане.\n\nNovaCiv`
- **EN:** `Digital community without rulers — only citizens.\n\nNovaCiv`
- **DE:** `Digitale Gemeinschaft ohne Herrscher – nur Bürger.\n\nNovaCiv`

**Inline Keyboard:**
```
[Перейти на сайт]  (RU)
[Visit Website]    (EN)
[Zur Website]      (DE)
```

**URL:** `https://novaciv.space`

---

## 🔒 SAFETY & CONSTRAINTS

### ✅ No Secrets in Logs
- Only error messages logged (no tokens, no sensitive data)
- Image URLs logged only in error cases (safe, public URLs)

### ✅ Backward Compatible
- `telegramPostedAt` logic unchanged
- Old topics without `imageUrl` work (fallback to text)
- Existing health metrics unchanged

### ✅ Minimal Refactor
- Only UX changes (formatting, images, keyboards)
- Core logic unchanged
- No breaking changes to data model (imageUrl is optional)

### ✅ Stable Parse Mode
- **Mode:** HTML (consistent across all posts)
- **Safety:** HTML escaping for user content
- **Buttons:** Inline keyboard (no markdown needed)

### ✅ Error Handling
- Photo send failures → automatic fallback to text
- Invalid image URLs → fallback to text
- Network errors → logged, pipeline continues
- No exceptions thrown (graceful degradation)

---

## 📊 EXAMPLE TELEGRAM POST (Text Mock)

### News Post with Image:

```
┌─────────────────────────────────┐
│                                 │
│      [RSS Image Photo]          │
│                                 │
└─────────────────────────────────┘

<b>Major Development in Space Exploration</b>

Scientists have discovered a new exoplanet that could potentially support life. The planet, located in the habitable zone of its star, shows promising signs of water and atmosphere...

<a href="https://bbc.com/news/...">Источник</a> • <a href="https://novaciv.space">NovaCiv</a>

[Источник]  [NovaCiv]
```

### News Post without Image (Fallback):

```
Major Development in Space Exploration

Scientists have discovered a new exoplanet that could potentially support life. The planet, located in the habitable zone of its star, shows promising signs of water and atmosphere. This discovery opens new possibilities for understanding the conditions necessary for life beyond Earth.

— NovaCiv movement
Digital community without rulers — only citizens.
Источник: https://bbc.com/news/...
https://novaciv.space/news

[Источник]  [NovaCiv]
```

### NovaCiv Brand Insert:

```
┌─────────────────────────────────┐
│                                 │
│    [NovaCiv og-image.png]       │
│                                 │
└─────────────────────────────────┘

Цифровое сообщество без правителей — только граждане.

NovaCiv

[Перейти на сайт]
```

---

## 🎯 VERIFICATION CHECKLIST

After deployment, verify in Telegram:

- [ ] News posts with RSS images show photos
- [ ] News posts without images show as text
- [ ] Caption format is correct (title, summary, links)
- [ ] Inline keyboard buttons work ("Источник", "NovaCiv")
- [ ] Brand insert appears after 3rd post (max 1 per run)
- [ ] Brand insert shows og-image.png
- [ ] Brand insert button text matches language
- [ ] Broken image URLs fall back to text (no errors)
- [ ] Pipeline continues on errors

---

## 📝 COMMIT INFORMATION

**Commit Hash:** `95ae3c9d6f022e12dd9ec4e522c2719454d4e62d`

**Commit Message:**
```
feat: restore telegram news visuals (rss images + NovaCiv insert)
```

**Files Changed:**
- `netlify/functions/fetch-news.js` (+35 lines)
- `netlify/functions/news-cron.js` (+237 lines)

**Total Changes:** +257 insertions, -15 deletions

---

## ✅ STATUS

**Implementation:** ✅ Complete  
**Testing:** ⏳ Pending deployment  
**Ready for:** Production deployment
