
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const Home: React.FC = () => {
  const { t, setLanguage } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    // Автоматическое определение языка браузера
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('ru')) {
      setLanguage('ru');
    } else {
      setLanguage('en');
    }
  }, [setLanguage]);

  const handleEnter = () => {
    // Add fade out effect and navigate to manifesto
    document.body.style.transition = 'opacity 1s ease';
    document.body.style.opacity = '0';
    setTimeout(() => {
      navigate('/manifesto');
      document.body.style.opacity = '1';
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-white overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute top-0 left-0 w-full md:w-1/3 h-1/3 md:h-full bg-cover bg-center md:bg-left bg-no-repeat opacity-30 pointer-events-none"
        style={{
          backgroundImage: `url('/lovable-uploads/03f35303-0d95-4c3c-9e72-4442e7ba90f0.png')`
        }}
      />
      
      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col md:flex-row min-h-screen">
        
        {/* Left Section - Image space (hidden on mobile) */}
        <div className="hidden md:block md:w-1/3 flex-shrink-0"></div>
        
        {/* Right Section - Content */}
        <div className="flex-1 flex flex-col justify-center items-center md:items-start px-6 md:px-16 py-8 pt-32 md:pt-8">
          
          {/* Title Section */}
          <div className="mb-12 md:mb-16 text-center md:text-left">
            <h1 className="text-4xl md:text-7xl font-light text-gray-900 mb-4 md:mb-6 tracking-wider uppercase leading-tight">
              NovaCiv
            </h1>
            <div className="w-16 md:w-24 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-6 md:mb-8 mx-auto md:mx-0"></div>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-lg font-light px-4 md:px-0">
              {t.home.subtitle}
            </p>
          </div>
          
          {/* Action Section */}
          <div className="space-y-6 md:space-y-8 text-center md:text-left">
            <button
              onClick={handleEnter}
              className="group px-8 md:px-12 py-3 md:py-4 text-base md:text-lg border-2 border-gray-300 bg-transparent text-gray-700 rounded-lg transition-all duration-500 hover:border-blue-400 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:shadow-xl hover:shadow-blue-100/50 hover:scale-105 font-medium tracking-wide"
            >
              <span className="relative">
                {t.home.enterButton}
                <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 group-hover:w-full"></span>
              </span>
            </button>
            
            {/* Subtle hint */}
            <p className="text-sm text-gray-400 italic px-4 md:px-0">
              {t.home.hintText}
            </p>
          </div>
          
        </div>
        
      </div>
      
      {/* Decorative Elements */}
      <div className="absolute bottom-4 md:bottom-8 right-4 md:right-8 opacity-20">
        <div className="w-16 md:w-32 h-16 md:h-32 border border-gray-200 rounded-full flex items-center justify-center">
          <div className="w-10 md:w-20 h-10 md:h-20 border border-gray-300 rounded-full flex items-center justify-center">
            <div className="w-4 md:w-8 h-4 md:h-8 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"></div>
          </div>
        </div>
      </div>
      
      {/* Floating particles effect */}
      <div className="absolute top-1/4 right-1/4 w-1 md:w-2 h-1 md:h-2 bg-blue-300 rounded-full opacity-40 animate-pulse"></div>
      <div className="absolute top-1/3 right-1/3 w-0.5 md:w-1 h-0.5 md:h-1 bg-purple-300 rounded-full opacity-60 animate-pulse delay-1000"></div>
      <div className="absolute bottom-1/3 right-1/5 w-1 md:w-1.5 h-1 md:h-1.5 bg-indigo-300 rounded-full opacity-50 animate-pulse delay-2000"></div>
      
    </div>
  );
};

export default Home;
