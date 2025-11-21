// netlify/functions/send-email.js
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch (e) {
    console.error("Invalid JSON body", e);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const {
    nickname = "Без ника",
    contact = "Не указан",
    message = "",
    language = "ru",
    memberId = null,
  } = data;

  if (!message || !contact) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing message or contact" }),
    };
  }

  try {
    await sgMail.send({
      to: "prokurorus2@gmail.com", // твой email
      from: "noreply@novaciv.space",
      subject: "Новое обращение на сайте NovaCiv",
      text: `
Новое обращение на NovaCiv.

Имя/ник: ${nickname}
Контакт: ${contact}

Сообщение:
${message}

Язык: ${language}
memberId: ${memberId ?? "нет"}

Дата: ${new Date().toLocaleString("ru-RU")}
      `.trim(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error("Email error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Email failed" }),
    };
  }
};
