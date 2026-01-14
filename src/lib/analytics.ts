// Google Analytics integration for NovaCiv
// This module provides a type-safe interface for tracking events

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'set',
      targetId: string | object,
      config?: object
    ) => void;
    dataLayer?: unknown[];
  }
}

// Initialize Google Analytics
export const initGoogleAnalytics = (measurementId: string) => {
  // Only initialize in production
  if (import.meta.env.PROD && measurementId) {
    // Load gtag script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);

    // Initialize dataLayer and gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function (...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      page_path: window.location.pathname,
    });
  }
};

// Track page views
export const trackPageView = (path: string, title?: string) => {
  if (window.gtag && import.meta.env.PROD) {
    window.gtag('config', import.meta.env.VITE_GA_MEASUREMENT_ID || '', {
      page_path: path,
      page_title: title || document.title,
    });
  }
};

// Track custom events
export const trackEvent = (
  action: string,
  category: string,
  label?: string,
  value?: number
) => {
  if (window.gtag && import.meta.env.PROD) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// Track specific NovaCiv events
export const analytics = {
  // User engagement
  trackJoinClick: () => trackEvent('join_click', 'engagement', 'join_button'),
  trackCharterView: (language: string) =>
    trackEvent('charter_view', 'content', language),
  trackManifestView: (language: string) =>
    trackEvent('manifest_view', 'content', language),
  trackNewsView: () => trackEvent('news_view', 'content', 'news_page'),
  trackForumView: () => trackEvent('forum_view', 'content', 'forum_page'),

  // Language switching
  trackLanguageSwitch: (from: string, to: string) =>
    trackEvent('language_switch', 'navigation', `${from}_to_${to}`),

  // Video generation (if applicable)
  trackVideoGeneration: (language: string) =>
    trackEvent('video_generation', 'video', language),

  // Admin actions (if applicable)
  trackAdminAction: (action: string) =>
    trackEvent('admin_action', 'admin', action),
};
