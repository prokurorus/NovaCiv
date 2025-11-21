import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const handler = async (event, context) => {
  try {
    const data = JSON.parse(event.body);

    await sgMail.send({
      to: "prokurorus2@gmail.com", // твой email
      from: "noreply@novaciv.space",
      subject: "Новое обращение на сайте NovaCiv",
      text: `
Новый запрос от участника:
Имя/ник: ${data.nickname}
Контакт: ${data.contact}
Сообщение:
${data.message}

Язык: ${data.language}
memberId: ${data.memberId}
Дата: ${new Date().toLocaleString("ru-RU")}
      `,
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
