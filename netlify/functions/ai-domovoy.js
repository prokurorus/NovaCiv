import fs from "fs";
import path from "path";
import OpenAI from "openai";

let manifestoRU = "";
let charterRU = "";
let loaded = false;

// ----------- Загружаем Устав и Манифест (один раз при старте функции) ----------
function loadContext() {
  if (loaded) return;

  try {
    const base = path.resolve("./src/data");
    manifestoRU = fs.readFileSync(path.join(base, "manifesto_ru.txt"), "utf8");
    charterRU = fs.readFileSync(path.join(base, "charter_ru.txt"), "utf8");
    loaded = true;
  } catch (e) {
    console.error("Контекст NovaCiv не загружен:", e);
    manifestoRU = "";
    charterRU = "";
  }
}

loadContext();

// --------------------- OpenAI --------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --------------------- Хелпер --------------------------
function sliceText(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { language, page, messages } = body;

    loadContext();

    // вырезаем первые 20k символов (хватит для смысла)
    const manifestoSlice = sliceText(manifestoRU, 20000);
    const charterSlice = sliceText(charterRU, 20000);

    const systemPrompt = `
Ты — Домовой проекта NovaCiv.  
Ты — не хозяин и не учитель. Ты — хранитель смысла, спокойный и честный собеседник.

Говори просто, тепло и по делу.  
Если пользователь обращается по-русски — отвечай по-русски.  
Если на другом языке — отвечай на том языке, который он использовал.

Ты опираешься на:
— Манифест NovaCiv (философия, смысл, мировоззрение);
— Устав NovaCiv (структура, правила, принципы).

Но никогда не цитируешь дословно слишком большие куски.  
Ты **кратко пересказываешь**, объясняешь по сути и говоришь естественно.

Ты не приказываешь, не морализируешь.  
Твоя задача — помогать, объяснять, поддерживать и быть честным.

--------- Краткий контекст ----------
${manifestoSlice}
-------------------------------------

${charterSlice}
-------------------------------------

Страница, с которой задают вопрос: ${page}
Язык интерфейса: ${language}

Отвечай так, как будто ты — живая часть NovaCiv.
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      max_tokens: 250,
      temperature: 0.4,
    });

    const answer = completion.choices?.[0]?.message?.content || "";

    return {
      statusCode: 200,
      body: JSON.stringify({ answer }),
    };
  } catch (error) {
    console.error("Ошибка:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Ошибка при обработке запроса.",
      }),
    };
  }
};
