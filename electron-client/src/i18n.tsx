import React, { createContext, useContext, useState, useCallback } from 'react';
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import it from './locales/it.json';

export type Locale = 'en' | 'de' | 'fr' | 'it';

const bundles: Record<Locale, Record<string, string>> = { en, de, fr, it };

interface I18nContext {
    locale: Locale;
    setLocale: (l: Locale) => void;
    t: (key: string, fallback?: string) => string;
}

const Ctx = createContext<I18nContext>({ locale: 'en', setLocale: () => {}, t: k => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(() => {
        const saved = localStorage.getItem('atlas-locale');
        return (saved as Locale) || 'en';
    });

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l);
        localStorage.setItem('atlas-locale', l);
    }, []);

    const t = useCallback((key: string, fallback?: string): string => {
        return bundles[locale]?.[key] ?? bundles['en']?.[key] ?? fallback ?? key;
    }, [locale]);

    return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useTranslation() {
    return useContext(Ctx);
}
