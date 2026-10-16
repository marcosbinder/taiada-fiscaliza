/**
 * src/config/brand.ts
 *
 * Configuração Oficial da Identidade Visual e Sistema de Dupla Marca
 * "Taiada Fiscaliza" (Modo A - Institucional) e "Cobra, Taiada!" (Modo B - Imperativo).
 *
 * Município Exclusivo: Caçapava - SP ("Terra da Taiada" - IBGE 3508504)
 * Paleta Oficial Verde Taiada: #15301d (--taiada-dark) e #347947 (--taiada-primary).
 */

export type BrandMode = 'institucional' | 'imperativo';

export interface BrandConfig {
  mode: BrandMode;
  primaryName: string;
  subtitle: string;
  ctaLabel: string;
  upvoteLabel: string;
  badgeText: string;
  description: string;
  ogTitleTemplate: (title: string) => string;
}

export const TAIADA_PALETTE = {
  // Cores Oficiais da Marca
  dark: '#15301d', // rgb(21, 48, 29) - Verde Taiada Profundo
  primary: '#347947', // rgb(52, 121, 71) - Verde Taiada Vivo
  lightBg: '#F4F7F5', // Superfície Apple clara harmonizada
  darkBg: '#0B1910', // Superfície Apple escura profunda

  // Superfícies e Vidros (Translucidez Apple com backdrop-filter)
  glassLight: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(21, 48, 29, 0.90)',

  // Tipografia Semântica
  textLightPrimary: '#0f2416',
  textLightSecondary: '#3f5947',
  textDarkPrimary: '#f4f7f5',
  textDarkSecondary: '#a7c7b0',

  // Bordas e Divisores
  borderSubtleLight: 'rgba(21, 48, 29, 0.10)',
  borderSubtleDark: 'rgba(52, 121, 71, 0.35)',
  highContrastBorder: '#15301d',
} as const;

export const BRAND_CONFIGS: Record<BrandMode, BrandConfig> = {
  institucional: {
    mode: 'institucional',
    primaryName: 'Taiada Fiscaliza',
    subtitle: 'Cobra, Taiada! • Zeladoria Colaborativa de Caçapava',
    ctaLabel: '+ Cobra, Taiada! Registrar Problema',
    upvoteLabel: 'Cobra, Taiada! Também passo por aqui',
    badgeText: 'Zeladoria Comunitária de Caçapava - SP',
    description:
      'Plataforma Cívica Colaborativa para mapeamento, agrupamento inteligente e fiscalização comunitária de zeladoria urbana em Caçapava - SP.',
    ogTitleTemplate: (title: string) => `${title} | Taiada Fiscaliza (Caçapava - SP)`,
  },
  imperativo: {
    mode: 'imperativo',
    primaryName: 'Cobra, Taiada!',
    subtitle: 'Taiada Fiscaliza • Mapa Cívico de Caçapava',
    ctaLabel: '+ Cobra, Taiada! Registrar Problema',
    upvoteLabel: 'Cobra, Taiada! Também passo por aqui',
    badgeText: 'Fiscalização Popular de Caçapava - SP',
    description:
      'Cobra, Taiada! Mapeie buracos, iluminação apagada, mato alto e cobre providências da Prefeitura e Câmara de Caçapava.',
    ogTitleTemplate: (title: string) => `${title} | Cobra, Taiada! (Caçapava - SP)`,
  },
};

/**
 * Normaliza e resolve o modo da marca com fallback seguro para 'institucional'.
 */
export function resolveBrandMode(mode?: string | null): BrandMode {
  if (mode === 'imperativo') {
    return 'imperativo';
  }
  return 'institucional';
}

/**
 * Obtém a configuração de marca ativa.
 * Resiliente a ambientes browser (Vite import.meta.env), Node.js (process.env) ou fallback local.
 */
export function getBrandConfig(mode?: BrandMode | string | null): BrandConfig {
  if (mode && (mode === 'institucional' || mode === 'imperativo')) {
    return BRAND_CONFIGS[mode];
  }

  // Tenta ler do ambiente caso não informado explicitamente
  let envMode: string | undefined;
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_APP_BRAND_MODE
    ) {
      envMode = import.meta.env.VITE_APP_BRAND_MODE;
    } else if (typeof process !== 'undefined' && process.env && process.env.VITE_APP_BRAND_MODE) {
      envMode = process.env.VITE_APP_BRAND_MODE;
    }
  } catch {
    // Ambiente sem acesso a variáveis de ambiente
  }

  const resolved = resolveBrandMode(envMode);
  return BRAND_CONFIGS[resolved];
}
