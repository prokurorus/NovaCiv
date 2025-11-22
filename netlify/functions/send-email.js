const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");

    const nickname = data.nickname || "Anonymous";
    const contact = data.contact || "not provided";
    const message = data.message || "";
    const language = data.language || "unknown";
    const memberId = data.memberId || "unknown";

    const msg = {
      // КУДА отправляем — твой Gmail
      to: "prokurorus3@gmail.com",

      // ОТ КОГО — доменный адрес NovaCiv
      from: {
        email: "no-reply@novaciv.space",
        name: "NovaCiv Website",
      },

      // Куда пойдут ответы при нажатии "Ответить" в почте
      replyTo: {
        email: "prokurorus3@gmail.com",
        name: "Ruslan Nejerenco",
      },

      subject: "Новое обращение на сайте NovaCiv",

      // Текстовый вариант (fallback)
      text: `
Новое обращение на сайте NovaCiv

Псевдоним: ${nickname}
Контакт: ${contact}
Язык сайта: ${language}
ID участника: ${memberId}

Сообщение:
${message}
      `.trim(),

      // Красивый HTML-шаблон
      html: `
<div style="font-family: Arial, sans-serif; background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb; max-width: 600px; margin: 0 auto;">
  <h2 style="margin-top: 0; color: #111827; font-size: 20px;">
    Новое обращение на сайте <strong>NovaCiv</strong>
  </h2>

  <p style="margin: 0 0 12px 0; color: #374151;">
    <strong>Псевдоним:</strong> ${nickname}<br>
    <strong>Контакт:</strong> ${contact}<br>
    <strong>Язык сайта:</strong> ${language}<br>
    <strong>ID участника:</strong> ${memberId}
  </p>

  <div style="margin: 20px 0; padding: 12px 16px; background: #f9fafb; border-left: 3px solid #3b82f6;">
    <strong style="color:#111827;">Сообщение:</strong><br>
    <div style="white-space: pre-wrap; color: #374151;">${message}</div>
  </div>

  <p style="font-size: 12px; color: #6b7280; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    Это автоматическое уведомление сайта
    <a href="https://novaciv.space" style="color:#3b82f6; text-decoration:none;">NovaCiv</a>.
  </p>
</div>
      `,
    };

    const [response] = await sgMail.send(msg);

    console.log("SendGrid response status:", response.statusCode);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error("SendGrid error:", error);
    if (error.response) {
      console.error("SendGrid error response body:", error.response.body);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message,
        details: error.response && error.response.body,
      }),
    };
  }
};
