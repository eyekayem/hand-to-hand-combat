// Keeps <link rel="canonical"> pointed at the public bklt.ai/h2h URL for the
// current route, whichever origin actually served the page.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const PUBLIC_ORIGIN = 'https://www.bklt.ai';

export function CanonicalUrl() {
  const { pathname } = useLocation();
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const href = `${PUBLIC_ORIGIN}${base}${pathname === '/' ? '/' : pathname}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', href);
  }, [pathname]);
  return null;
}
