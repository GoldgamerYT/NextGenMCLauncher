import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'system';

interface ThemeContextValue {
    theme: Theme;
    effectiveTheme: 'dark' | 'light';
    setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeContextValue>({
    theme: 'dark',
    effectiveTheme: 'dark',
    setTheme: () => {},
});

function resolveEffective(theme: Theme): 'dark' | 'light' {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        return (localStorage.getItem('atlas-theme') as Theme) || 'dark';
    });
    const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>(() =>
        resolveEffective((localStorage.getItem('atlas-theme') as Theme) || 'dark')
    );

    const applyTheme = useCallback((t: Theme) => {
        const eff = resolveEffective(t);
        setEffectiveTheme(eff);
        document.documentElement.setAttribute('data-theme', eff);
    }, []);

    useEffect(() => {
        applyTheme(theme);
    }, [theme, applyTheme]);

    // Respond to system theme changes when theme === 'system'
    useEffect(() => {
        if (theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        const handler = () => applyTheme('system');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme, applyTheme]);

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t);
        localStorage.setItem('atlas-theme', t);
        applyTheme(t);
    }, [applyTheme]);

    return (
        <Ctx.Provider value={{ theme, effectiveTheme, setTheme }}>
            {children}
        </Ctx.Provider>
    );
}

export function useTheme() {
    return useContext(Ctx);
}
