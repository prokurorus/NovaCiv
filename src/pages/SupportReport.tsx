import React from "react";
import { useLanguage } from "../context/LanguageContext";
import type { Language } from "../types/language";
import LanguageSwitcher from "../components/LanguageSwitcher";

const contentByLang: Record<
  Language,
  {
    title: string;
    intro: string;
    introDetails: string;
    headers: {
      date: string;
      type: string;
      amount: string;
      currency: string;
      purpose: string;
      reference: string;
    };
    emptyState: string;
    note: string;
  }
> = {
  ru: {
    title: "Отчет о поддержке",
    intro:
      "Эта страница фиксирует поступления поддержки и расходы на обслуживание проекта.",
    introDetails:
      "На старте записи могут отсутствовать; прозрачность — один из принципов NovaCiv.",
    headers: {
      date: "Дата",
      type: "Тип (Поступление/Расход)",
      amount: "Сумма",
      currency: "Валюта",
      purpose: "Назначение",
      reference: "Tx/Ref",
    },
    emptyState: "Записей пока нет.",
    note: "Это публичный журнал. Персональные данные не собираются.",
  },
  en: {
    title: "Support Report",
    intro:
      "This page records incoming support and spending for project maintenance.",
    introDetails:
      "Initial entries may be empty; transparency is a principle of NovaCiv.",
    headers: {
      date: "Date",
      type: "Type (Incoming/Spending)",
      amount: "Amount",
      currency: "Currency",
      purpose: "Purpose",
      reference: "Tx/Ref",
    },
    emptyState: "No entries yet.",
    note: "This is a public log. Personal data is not collected.",
  },
  de: {
    title: "Unterstützungsbericht",
    intro:
      "Diese Seite erfasst eingehende Unterstützung und Ausgaben für die Projektpflege.",
    introDetails:
      "Zu Beginn können Einträge fehlen; Transparenz ist ein Prinzip von NovaCiv.",
    headers: {
      date: "Datum",
      type: "Typ (Eingang/Ausgabe)",
      amount: "Betrag",
      currency: "Währung",
      purpose: "Zweck",
      reference: "Tx/Ref",
    },
    emptyState: "Noch keine Einträge.",
    note: "Dies ist ein öffentliches Protokoll. Personenbezogene Daten werden nicht erfasst.",
  },
  es: {
    title: "Informe de apoyo",
    intro:
      "Esta página registra los aportes recibidos y los gastos para el mantenimiento del proyecto.",
    introDetails:
      "Al inicio puede no haber entradas; la transparencia es un principio de NovaCiv.",
    headers: {
      date: "Fecha",
      type: "Tipo (Entrada/Gasto)",
      amount: "Monto",
      currency: "Moneda",
      purpose: "Propósito",
      reference: "Tx/Ref",
    },
    emptyState: "Aún no hay entradas.",
    note: "Este es un registro público. No se recopilan datos personales.",
  },
};

const SupportReportPage: React.FC = () => {
  const { language } = useLanguage();
  const copy = contentByLang[language];

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 md:px-8 py-12 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">{copy.title}</h1>
            <p className="text-sm text-zinc-600">{copy.intro}</p>
            <p className="text-sm text-zinc-600">{copy.introDetails}</p>
          </div>
          <LanguageSwitcher />
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-zinc-700">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">
                    {copy.headers.date}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {copy.headers.type}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {copy.headers.amount}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {copy.headers.currency}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {copy.headers.purpose}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    {copy.headers.reference}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-zinc-200">
                  <td className="px-4 py-4 text-zinc-500" colSpan={6}>
                    {copy.emptyState}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-zinc-500">{copy.note}</p>
      </div>
    </main>
  );
};

export default SupportReportPage;
