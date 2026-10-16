/**
 * src/context/AppPreferencesContext.tsx
 *
 * Provedor de Estado Global e Preferências do Usuário com Persistência em LocalStorage.
 * Gerencia:
 * - Modo da Marca ('institucional' | 'imperativo')
 * - Tema Visual ('light' | 'dark' | 'high-contrast' - Modo Sol Forte)
 * - Modo Economia de Dados 3G/4G (dataSaverMode: suprime download de fotos)
 * - Visualização Padrão ('map' | 'list')
 * - Sincronização do atributo data-theme e classe dark em document.documentElement
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  BrandMode,
  BrandConfig,
  getBrandConfig,
  resolveBrandMode,
} from '../config/brand';
import { ThemeMode, ViewMode } from '../shared/types';

// Chaves de armazenamento persistente no LocalStorage
const STORAGE_KEYS = {
  BRAND_MODE: 'taiada_pref_brand_mode',
  THEME: 'taiada_pref_theme',
  DATA_SAVER: 'taiada_pref_data_saver',
  DEFAULT_VIEW: 'taiada_pref_default_view',
} as const;

export interface AppPreferencesContextType {
  brandMode: BrandMode;
  brandConfig: BrandConfig;
  theme: ThemeMode;
  dataSaverMode: boolean;
  defaultView: ViewMode;
  setBrandMode: (mode: BrandMode) => void;
  toggleBrandMode: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setDataSaverMode: (enabled: boolean) => void;
  toggleDataSaverMode: () => void;
  setDefaultView: (view: ViewMode) => void;
  toggleDefaultView: () => void;
  clearAllPreferences: () => void;
}

const AppPreferencesContext = createContext<AppPreferencesContextType | undefined>(undefined);

// Helpers defensivos para LocalStorage
function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ambiente sem localStorage ou permissão negada
  }
  return null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignora erro de cota ou bloqueio
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignora erro
  }
}

// Detecta tema inicial padrão considerando preferências do sistema
function detectInitialTheme(): ThemeMode {
  const saved = safeGetItem(STORAGE_KEYS.THEME);
  if (saved === 'light' || saved === 'dark' || saved === 'high-contrast') {
    return saved;
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'light';
}

// Detecta modo de marca inicial
function detectInitialBrandMode(): BrandMode {
  const saved = safeGetItem(STORAGE_KEYS.BRAND_MODE);
  if (saved === 'institucional' || saved === 'imperativo') {
    return saved;
  }
  return getBrandConfig().mode;
}

// Detecta modo economia de dados inicial
function detectInitialDataSaver(): boolean {
  const saved = safeGetItem(STORAGE_KEYS.DATA_SAVER);
  if (saved !== null) {
    return saved === 'true';
  }
  // Suporte a detecção nativa do navegador (Save-Data)
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn && conn.saveData === true) {
      return true;
    }
  }
  return false;
}

// Detecta visualização padrão inicial
function detectInitialDefaultView(): ViewMode {
  const saved = safeGetItem(STORAGE_KEYS.DEFAULT_VIEW);
  if (saved === 'map' || saved === 'list') {
    return saved;
  }
  return 'map';
}

interface AppPreferencesProviderProps {
  children: ReactNode;
}

export const AppPreferencesProvider: React.FC<AppPreferencesProviderProps> = ({ children }) => {
  const [brandMode, setBrandModeState] = useState<BrandMode>(detectInitialBrandMode);
  const [theme, setThemeState] = useState<ThemeMode>(detectInitialTheme);
  const [dataSaverMode, setDataSaverModeState] = useState<boolean>(detectInitialDataSaver);
  const [defaultView, setDefaultViewState] = useState<ViewMode>(detectInitialDefaultView);

  // Sincroniza tema no DOM (atributo data-theme e classe Tailwind dark)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Sincroniza <meta name="theme-color"> na barra de status mobile
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      if (theme === 'dark') {
        themeColorMeta.setAttribute('content', '#0B1910');
      } else if (theme === 'high-contrast') {
        themeColorMeta.setAttribute('content', '#15301d');
      } else {
        themeColorMeta.setAttribute('content', '#15301d');
      }
    }
  }, [theme]);

  // Modificadores de Estado com Persistência
  const setBrandMode = useCallback((newMode: BrandMode) => {
    const resolved = resolveBrandMode(newMode);
    setBrandModeState(resolved);
    safeSetItem(STORAGE_KEYS.BRAND_MODE, resolved);
  }, []);

  const toggleBrandMode = useCallback(() => {
    setBrandModeState((prev) => {
      const next: BrandMode = prev === 'institucional' ? 'imperativo' : 'institucional';
      safeSetItem(STORAGE_KEYS.BRAND_MODE, next);
      return next;
    });
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    safeSetItem(STORAGE_KEYS.THEME, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      let next: ThemeMode;
      if (prev === 'light') next = 'dark';
      else if (prev === 'dark') next = 'high-contrast';
      else next = 'light';
      safeSetItem(STORAGE_KEYS.THEME, next);
      return next;
    });
  }, []);

  const setDataSaverMode = useCallback((enabled: boolean) => {
    setDataSaverModeState(enabled);
    safeSetItem(STORAGE_KEYS.DATA_SAVER, String(enabled));
  }, []);

  const toggleDataSaverMode = useCallback(() => {
    setDataSaverModeState((prev) => {
      const next = !prev;
      safeSetItem(STORAGE_KEYS.DATA_SAVER, String(next));
      return next;
    });
  }, []);

  const setDefaultView = useCallback((newView: ViewMode) => {
    setDefaultViewState(newView);
    safeSetItem(STORAGE_KEYS.DEFAULT_VIEW, newView);
  }, []);

  const toggleDefaultView = useCallback(() => {
    setDefaultViewState((prev) => {
      const next: ViewMode = prev === 'map' ? 'list' : 'map';
      safeSetItem(STORAGE_KEYS.DEFAULT_VIEW, next);
      return next;
    });
  }, []);

  const clearAllPreferences = useCallback(() => {
    safeRemoveItem(STORAGE_KEYS.BRAND_MODE);
    safeRemoveItem(STORAGE_KEYS.THEME);
    safeRemoveItem(STORAGE_KEYS.DATA_SAVER);
    safeRemoveItem(STORAGE_KEYS.DEFAULT_VIEW);

    setBrandModeState('institucional');
    setThemeState('light');
    setDataSaverModeState(false);
    setDefaultViewState('map');
  }, []);

  const brandConfig = useMemo(() => getBrandConfig(brandMode), [brandMode]);

  const value = useMemo<AppPreferencesContextType>(
    () => ({
      brandMode,
      brandConfig,
      theme,
      dataSaverMode,
      defaultView,
      setBrandMode,
      toggleBrandMode,
      setTheme,
      toggleTheme,
      setDataSaverMode,
      toggleDataSaverMode,
      setDefaultView,
      toggleDefaultView,
      clearAllPreferences,
    }),
    [
      brandMode,
      brandConfig,
      theme,
      dataSaverMode,
      defaultView,
      setBrandMode,
      toggleBrandMode,
      setTheme,
      toggleTheme,
      setDataSaverMode,
      toggleDataSaverMode,
      setDefaultView,
      toggleDefaultView,
      clearAllPreferences,
    ]
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
};

export function useAppPreferences(): AppPreferencesContextType {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences deve ser utilizado dentro de um <AppPreferencesProvider>.');
  }
  return context;
}
