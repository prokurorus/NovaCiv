
export type Language = 'en' | 'ru' | 'de' | 'es';

export interface TranslationContent {
  navigation: {
    home: string;
    manifesto: string;
    charter: string;
    join: string;
  };
  home: {
    title: string;
    subtitle: string;
    enterButton: string;
    hintText: string;
    manifestoSummary: {
      title: string;
      content: string;
      readMore: string;
    };
    supporterCounter: {
      title: string;
      count: string;
    };
    features: {
      title: string;
      items: Array<{
        title: string;
        description: string;
      }>;
    };
  };
  manifesto: {
    title: string;
    sections: Array<{
      title: string;
      content: string;
    }>;
  };
  charter: {
    title: string;
    sections: Array<{
      title: string;
      content: string;
    }>;
  };
  join: {
    title: string;
    subtitle: string;
    form: {
      name: string;
      field: string;
      message: string;
      submit: string;
      success: string;
    };
  };
}
