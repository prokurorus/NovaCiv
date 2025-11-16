import CharterRu from "./Charter-ru";
import CharterEn from "./Charter-en";
import CharterEs from "./Charter-es";
import CharterDe from "./Charter-de";
import { useLanguage } from "../context/LanguageContext";

const CharterPage = () => {
  const { language } = useLanguage();

  switch (language) {
    case "en":
      return <CharterEn />;
    case "es":
      return <CharterEs />;
    case "de":
      return <CharterDe />;
    case "ru":
    default:
      return <CharterRu />;
  }
};

export default CharterPage;
