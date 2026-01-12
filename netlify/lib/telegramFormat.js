// netlify/lib/telegramFormat.js
//
// Каноническое форматирование сообщений для Telegram
// Единый стиль для новостей и постов Домового

/**
 * Экранирование HTML для Telegram
 */
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Форматирование даты для новостей
 */
function formatDate(pubDate, lang) {
  if (!pubDate) return "";
  try {
    const date = new Date(pubDate);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      return lang === "ru" ? "только что" : lang === "de" ? "gerade eben" : "just now";
    } else if (diffHours < 24) {
      return lang === "ru" ? `${diffHours} ч назад` : lang === "de" ? `vor ${diffHours} Std` : `${diffHours}h ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return lang === "ru" ? `${diffDays} дн назад` : lang === "de" ? `vor ${diffDays} Tagen` : `${diffDays}d ago`;
    }
  } catch (e) {
    return "";
  }
}

/**
 * Извлечение домена из URL
 */
function extractDomain(url) {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

/**
 * Принудительное ограничение длины с приоритетным обрезанием
 * Приоритет обрезания: why > view > sense > question
 */
function enforceMaxLen(text, maxLen) {
  if (text.length <= maxLen) return text;
  
  // Пытаемся найти секции по тегам
  const whyMatch = text.match(/(<b>Почему важно:<\/b>|<b>Warum wichtig:<\/b>|<b>Why it matters:<\/b>)\s*(.*?)(?=\n\n|$)/is);
  const viewMatch = text.match(/(<b>Взгляд NovaCiv:<\/b>|<b>NovaCiv-Perspektive:<\/b>|<b>NovaCiv perspective:<\/b>)\s*(.*?)(?=\n\n|$)/is);
  const questionMatch = text.match(/(<b>Вопрос:<\/b>|<b>Frage:<\/b>|<b>Question:<\/b>)\s*(.*?)(?=\n\n|$)/is);
  
  let result = text;
  
  // Удаляем "Почему важно" если есть
  if (whyMatch && result.length > maxLen) {
    result = result.replace(whyMatch[0], "").replace(/\n\n\n+/g, "\n\n");
  }
  
  // Удаляем "Взгляд NovaCiv" если всё ещё длинно
  if (viewMatch && result.length > maxLen) {
    result = result.replace(viewMatch[0], "").replace(/\n\n\n+/g, "\n\n");
  }
  
  // Обрезаем sense если всё ещё длинно
  if (result.length > maxLen) {
    const senseIndex = result.indexOf("\n\n");
    if (senseIndex !== -1) {
      const beforeSense = result.substring(0, senseIndex);
      const afterSense = result.substring(senseIndex);
      const maxSenseLen = maxLen - beforeSense.length - afterSense.length - 50;
      if (maxSenseLen > 100) {
        const senseText = result.substring(senseIndex + 2, senseIndex + 2 + maxSenseLen);
        result = beforeSense + "\n\n" + senseText + "..." + afterSense;
      }
    }
  }
  
  // Финальная обрезка
  if (result.length > maxLen) {
    result = result.slice(0, maxLen - 3) + "...";
  }
  
  return result;
}

/**
 * Форматирование сообщения новости
 */
function formatNewsMessage({ title, url, sourceName, date, sense, why, view, question, lang }) {
  const lines = [];
  
  // Заголовок
  lines.push(`<b>🌐 NovaCiv — Movement news</b>`);
  lines.push(`<b>${escapeHtml(title || "(no title)")}</b>`);
  lines.push("");
  
  // Источник и дата
  const domain = sourceName || (url ? extractDomain(url) : "");
  const dateStr = formatDate(date, lang);
  if (domain || dateStr) {
    const sourceLine = [domain, dateStr].filter(Boolean).join(" • ");
    lines.push(`<i>${escapeHtml(sourceLine)}</i>`);
    lines.push("");
  }
  
  // Смысл (sense)
  if (sense) {
    lines.push(escapeHtml(sense));
    lines.push("");
  }
  
  // Почему важно
  if (why) {
    const whyLabel = lang === "ru" ? "Почему важно:" : lang === "de" ? "Warum wichtig:" : "Why it matters:";
    lines.push(`<b>${whyLabel}</b> ${escapeHtml(why)}`);
    lines.push("");
  }
  
  // Взгляд NovaCiv
  if (view) {
    const viewLabel = lang === "ru" ? "Взгляд NovaCiv:" : lang === "de" ? "NovaCiv-Perspektive:" : "NovaCiv perspective:";
    lines.push(`<b>${viewLabel}</b> ${escapeHtml(view)}`);
    lines.push("");
  }
  
  // Вопрос
  if (question) {
    const questionLabel = lang === "ru" ? "Вопрос:" : lang === "de" ? "Frage:" : "Question:";
    lines.push(`<b>${questionLabel}</b> ${escapeHtml(question)}`);
    lines.push("");
  }
  
  // Ссылки
  if (url) {
    lines.push(`<a href="${escapeHtml(url)}">Источник</a>`);
  }
  lines.push(`https://novaciv.space/news`);
  
  let message = lines.join("\n");
  
  // Контроль длины
  message = enforceMaxLen(message, 3500);
  
  return message;
}

/**
 * Форматирование сообщения Домового
 */
function formatDomovoyMessage({ headline, quote, reflection, question, lang }) {
  const lines = [];
  
  lines.push(`<b>🤖 NovaCiv — Домовой</b>`);
  lines.push(`<b>${escapeHtml(headline || "NovaCiv")}</b>`);
  lines.push("");
  
  // Цитата
  if (quote) {
    lines.push(escapeHtml(quote));
    lines.push("");
  }
  
  // Размышление
  if (reflection) {
    lines.push(escapeHtml(reflection));
    lines.push("");
  }
  
  // Вопрос
  if (question) {
    const questionLabel = lang === "ru" ? "Вопрос:" : lang === "de" ? "Frage:" : "Question:";
    lines.push(`<b>${questionLabel}</b> ${escapeHtml(question)}`);
    lines.push("");
  }
  
  // Ссылка
  lines.push(`https://novaciv.space`);
  
  let message = lines.join("\n");
  
  // Контроль длины: 600-1200 символов
  if (message.length > 1200) {
    // Обрезаем reflection
    const headerLength = lines[0].length + lines[1].length + lines[2].length + (lines[lines.length - 1]?.length || 0) + 20;
    const maxReflectionLength = 1200 - headerLength - (quote ? quote.length + 20 : 0) - (question ? question.length + 30 : 0);
    if (reflection && reflection.length > maxReflectionLength) {
      const truncatedReflection = reflection.slice(0, Math.max(100, maxReflectionLength - 3)) + "...";
      message = lines[0] + "\n" + lines[1] + "\n\n" + 
                (quote ? escapeHtml(quote) + "\n\n" : "") +
                escapeHtml(truncatedReflection) + "\n\n" +
                (question ? lines[lines.length - 3] + "\n" : "") +
                lines[lines.length - 1];
    } else {
      message = message.slice(0, 1200 - 3) + "...";
    }
  }
  
  return message;
}

module.exports = {
  formatNewsMessage,
  formatDomovoyMessage,
  enforceMaxLen,
  escapeHtml,
};
