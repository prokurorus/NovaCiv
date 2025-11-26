// netlify/functions/ai-voice.js

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: "OPENAI_API_KEY is not set on the server",
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const text = (body.text || "").toString().trim();
    const voice = body.voice || "alloy";
    const format = body.format || "mp3";

    if (!text) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Empty text for TTS" }),
      };
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice,
        input: text,
        format,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 200,
        body: JSON.stringify({
          error: `OpenAI TTS API error: HTTP ${response.status} – ${text}`,
        }),
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64Audio }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `TTS runtime error: ${String(err)}`,
      }),
    };
  }
};
