import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";

const content: Record<
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
    methodsTitle: "Способы поддержки (плейсхолдеры)",
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
    methodsTitle: "Contribution methods (placeholders)",
    transparencyTitle: "Transparency",
    transparencyText:
      "A public support report page will be added later. Transparency is a core principle of NovaCiv.",
  },
  de: {
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
    methodsTitle: "Contribution methods (placeholders)",
    transparencyTitle: "Transparency",
    transparencyText:
      "A public support report page will be added later. Transparency is a core principle of NovaCiv.",
  },
  es: {
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
    methodsTitle: "Contribution methods (placeholders)",
    transparencyTitle: "Transparency",
    transparencyText:
      "A public support report page will be added later. Transparency is a core principle of NovaCiv.",
  },
};

const SupportPage: React.FC = () => {
  const { language } = useLanguage();
  const copy = content[language];

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
              <span className="font-medium text-zinc-800">Bitcoin:</span>{" "}
              <span className="font-mono">BTC_ADDRESS_TO_BE_ADDED</span>
            </div>
            <div>
              <span className="font-medium text-zinc-800">Ethereum:</span>{" "}
              <span className="font-mono">ETH_ADDRESS_TO_BE_ADDED</span>
            </div>
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
