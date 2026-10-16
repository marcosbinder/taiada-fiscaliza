/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BRAND_MODE?: 'institucional' | 'imperativo';
  readonly PUBLIC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'lucide-react';
