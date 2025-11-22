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
      to: "prokurorus3@gmail.com", // куда отправляем
      from: {
        email: "prokurorus3@gmail.com", // ОТПРАВИТЕЛЬ — ТВОЙ ПОДТВЕРЖДЁННЫЙ АДРЕС
        name: "NovaCiv Website",
      },
      subject: "Новое обращение на сайте NovaCiv",
      text: `
Новое обращение на сайте NovaCiv

Псевдоним: ${nickname}
Контакт: ${contact}
Язык сайта: ${language}
ID участника: ${memberId}

Сообщение:
${message}
      `.trim(),
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
