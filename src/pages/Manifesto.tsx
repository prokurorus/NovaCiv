import ManifestoRu from "./Manifesto-ru";
import ManifestoEn from "./Manifesto-en";
import ManifestoDe from "./Manifesto-de";
import ManifestoEs from "./Manifesto-es";

import { useLanguage } from "@/context/LanguageContext";

export default function ManifestoPage() {
  const { language } = useLanguage();

  switch (language) {
    case "en":
      return <ManifestoEn />;
    case "de":
      return <ManifestoDe />;
    case "es":
      return <ManifestoEs />;
    case "ru":
    default:
      return <ManifestoRu />;
  }
}
