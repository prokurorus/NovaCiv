import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";

const contentByLang: Record<
  Language,
  {
    title: string;
    introTitle: string;
    intro: string;
    introDetails: string;
    legalTitle: string;
    legalText: string;
    responsibilityTitle: string;
    responsibilityText: string;
    methodsTitle: string;
    usdtWarning: string;
    transparencyTitle: string;
    transparencyText: string;
  }
> = {
  ru: {
    title: "Поддержка процесса NovaCiv",
    introTitle: "Короткое пояснение",
    intro:
      "NovaCiv — открытая философская и гражданская инициатива, а не продукт и не компания.",
    introDetails:
      "Книга распространяется свободно. Поддержка добровольна и не дает привилегий, доступа или прав.",
    legalTitle: "Правовое и этическое пояснение",
    legalText:
      "Взносы не являются оплатой. Взносы не являются пожертвованием за услуги. Эти средства не являются личным доходом автора. Средства предназначены только для инфраструктуры и развития проекта.",
    responsibilityTitle: "Коллективная ответственность",
    responsibilityText:
      "На этом этапе проект находится в фазе инициирования. Решения о распределении ресурсов будут переданы коллективному управлению после формирования сообщества. До этого расходы ограничены базовым обслуживанием проекта (сайт, хостинг, публикации). Это временная граница, а не обещание.",
    methodsTitle: "Способы поддержки",
    usdtWarning: "Отправляйте только USDT в сети TRC20 (Tron).",
    transparencyTitle: "Прозрачность",
    transparencyText:
      "Позже будет добавлена публичная страница отчета о поддержке. Прозрачность — один из базовых принципов NovaCiv.",
  },
  en: {
    title: "Support the NovaCiv Process",
    introTitle: "Short explanation",
    intro:
      "NovaCiv is an open philosophical and civic initiative, not a product or a company.",
    introDetails:
      "The book is distributed freely. Support is voluntary and does not grant privileges, access, or rights.",
    legalTitle: "Legal and ethical clarification",
    legalText:
      "Contributions are not payment. Contributions are not donations for services. These funds are not personal income of the author. The funds are intended only for project infrastructure and development.",
    responsibilityTitle: "Collective responsibility",
    responsibilityText:
      "At this stage the project is in an initiation phase. Decisions on resource allocation will be transferred to collective governance once the community forms. Until then, spending is limited to basic project maintenance (website, hosting, publishing). This is a temporary boundary, not a promise.",
    methodsTitle: "Contribution methods",
    usdtWarning: "Send only USDT on the TRC20 (Tron) network.",
    transparencyTitle: "Transparency",
    transparencyText:
      "A public support report page will be added later. Transparency is a core principle of NovaCiv.",
  },
  de: {
    title: "Unterstützung des NovaCiv-Prozesses",
    introTitle: "Kurze Erläuterung",
    intro:
      "NovaCiv ist eine offene philosophische und bürgerliche Initiative, kein Produkt und kein Unternehmen.",
    introDetails:
      "Das Buch wird frei verbreitet. Unterstützung ist freiwillig und verleiht keine Privilegien, keinen Zugang und keine Rechte.",
    legalTitle: "Rechtliche und ethische Klarstellung",
    legalText:
      "Beiträge sind keine Zahlung. Beiträge sind keine Spenden für Dienstleistungen. Diese Mittel sind kein persönliches Einkommen des Autors. Die Mittel sind ausschließlich für die Infrastruktur und die Entwicklung des Projekts bestimmt.",
    responsibilityTitle: "Kollektive Verantwortung",
    responsibilityText:
      "In dieser Phase befindet sich das Projekt in der Initiierungsphase. Entscheidungen über die Verteilung von Ressourcen werden nach der Bildung der Gemeinschaft an eine kollektive Verwaltung übertragen. Bis dahin sind Ausgaben auf die grundlegende Projektpflege beschränkt (Website, Hosting, Veröffentlichungen). Dies ist eine vorübergehende Grenze, kein Versprechen.",
    methodsTitle: "Unterstützungsmöglichkeiten",
    usdtWarning: "Senden Sie nur USDT im TRC20-Netzwerk (Tron).",
    transparencyTitle: "Transparenz",
    transparencyText:
      "Später wird eine öffentliche Seite mit Unterstützungsberichten hinzugefügt. Transparenz ist ein Grundprinzip von NovaCiv.",
  },
  es: {
    title: "Apoyo al proceso de NovaCiv",
    introTitle: "Explicación breve",
    intro:
      "NovaCiv es una iniciativa filosófica y cívica abierta, no un producto ni una empresa.",
    introDetails:
      "El libro se distribuye libremente. El apoyo es voluntario y no otorga privilegios, acceso ni derechos.",
    legalTitle: "Aclaración legal y ética",
    legalText:
      "Las contribuciones no son un pago. Las contribuciones no son donaciones por servicios. Estos fondos no son ingresos personales del autor. Los fondos están destinados únicamente a la infraestructura y al desarrollo del proyecto.",
    responsibilityTitle: "Responsabilidad colectiva",
    responsibilityText:
      "En esta etapa el proyecto se encuentra en fase de inicio. Las decisiones sobre la asignación de recursos se transferirán a la gobernanza colectiva una vez que se forme la comunidad. Hasta entonces, el gasto se limita al mantenimiento básico del proyecto (sitio web, hosting, publicaciones). Este es un límite temporal, no una promesa.",
    methodsTitle: "Formas de apoyo",
    usdtWarning: "Envíe solo USDT en la red TRC20 (Tron).",
    transparencyTitle: "Transparencia",
    transparencyText:
      "Más adelante se añadirá una página pública de informe de apoyo. La transparencia es uno de los principios básicos de NovaCiv.",
  },
};

const SupportPage: React.FC = () => {
  const { language } = useLanguage();
  const copy = contentByLang[language];

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-12 space-y-10">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">{copy.title}</h1>
          </div>
          <LanguageSwitcher />
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">
            {copy.introTitle}
          </h2>
          <p className="text-sm text-zinc-600">{copy.intro}</p>
          <p className="text-sm text-zinc-600">{copy.introDetails}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">
            {copy.legalTitle}
          </h2>
          <p className="text-sm text-zinc-600">{copy.legalText}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">
            {copy.responsibilityTitle}
          </h2>
          <p className="text-sm text-zinc-600">{copy.responsibilityText}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            {copy.methodsTitle}
          </h2>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 space-y-2 text-sm text-zinc-700">
            <div>
              <span className="font-medium text-zinc-800">Bitcoin (BTC):</span>{" "}
              <span className="font-mono">18LwxxcXjh6K9ykncz4b39jGsUSWp3dErk</span>
            </div>
            <div>
              <span className="font-medium text-zinc-800">
                USDT (TRC20 / Tron):
              </span>{" "}
              <span className="font-mono">
                TC9yo5U9tasmo7jjm5BXskGQMv5xwTzS2B
              </span>
            </div>
            <p className="text-xs text-zinc-500">{copy.usdtWarning}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-900">
            {copy.transparencyTitle}
          </h2>
          <p className="text-sm text-zinc-600">{copy.transparencyText}</p>
        </section>
      </div>
    </main>
  );
};

export default SupportPage;
