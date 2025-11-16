
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const SupporterCounter: React.FC = () => {
  const { t } = useLanguage();
  const [count, setCount] = useState(1200);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => prev + Math.floor(Math.random() * 3));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 text-center shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{t.home.supporterCounter.title}</h3>
      <div className="text-4xl font-bold text-blue-600 mb-2">
        {count.toLocaleString()}
      </div>
      <div className="w-16 h-1 bg-blue-600 mx-auto rounded-full"></div>
    </div>
  );
};

export default SupporterCounter;
