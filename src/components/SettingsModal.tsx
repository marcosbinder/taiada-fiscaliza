/**
 * src/components/SettingsModal.tsx
 *
 * Modal de Configurações do Munícipe com Abas / Seções Estruturadas:
 * 1. Alternador de Marca: 'Taiada Fiscaliza' (Institucional) vs 'Cobra, Taiada!' (Imperativo)
 * 2. Seletor de Tema Óptico: Claro (#F4F7F5), Escuro (#0B1910) e Sol Forte (Alto Contraste)
 * 3. Modo Economia de Dados 3G/4G (suprime download de fotos em conexões móveis)
 * 4. Visualização Padrão Inicial (Mapa Interativo vs Lista por Bairros)
 * 5. Diagnóstico de Dispositivo e Limpeza de Dados Locais de Sessão
 * 6. Informações Institucionais do Município de Caçapava - SP (IBGE 3508504)
 */

import React from 'react';
import {
  X,
  Sun,
  Moon,
  Zap,
  Wifi,
  WifiOff,
  Map,
  List,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useAppPreferences } from '../context/AppPreferencesContext';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceHashShort?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  deviceHashShort = 'anônimo',
}) => {
  const {
    brandMode,
    setBrandMode,
    theme,
    setTheme,
    dataSaverMode,
    setDataSaverMode,
    defaultView,
    setDefaultView,
    clearAllPreferences,
  } = useAppPreferences();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 select-none"
    >
      <div className="bg-white dark:bg-[#15301d] rounded-3xl max-w-lg w-full max-h-[92dvh] flex flex-col shadow-2xl border border-taiada-primary/20 overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-taiada-lightBg/50 dark:bg-black/20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-taiada-primary" />
            <h2 className="text-base font-bold text-taiada-dark dark:text-white">
              Preferências do Aplicativo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 text-gray-500 hover:text-black dark:text-gray-300 dark:hover:text-white active:scale-90 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com Rolagem */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-gray-700 dark:text-gray-200">
          {/* Seção 1: Identidade Visual e Modo de Marca */}
          <section className="space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-sm text-taiada-dark dark:text-white">
              <Sparkles className="w-4 h-4 text-taiada-primary" />
              <h3>Identidade & Modo de Marca</h3>
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              Escolha como você prefere se comunicar com a plataforma e com a comunidade:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Modo Institucional */}
              <button
                type="button"
                onClick={() => setBrandMode('institucional')}
                className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  brandMode === 'institucional'
                    ? 'border-taiada-primary bg-taiada-primary/10 shadow-sm'
                    : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="font-bold text-taiada-dark dark:text-white mb-0.5">
                  Taiada Fiscaliza
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Modo institucional e colaborativo para zeladoria de Caçapava.
                </div>
              </button>

              {/* Modo Imperativo */}
              <button
                type="button"
                onClick={() => setBrandMode('imperativo')}
                className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                  brandMode === 'imperativo'
                    ? 'border-taiada-primary bg-taiada-primary/10 shadow-sm'
                    : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="font-bold text-taiada-dark dark:text-white mb-0.5">
                  Cobra, Taiada!
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Modo direto e imperativo para cobrança cidadã de providências.
                </div>
              </button>
            </div>
          </section>

          {/* Seção 2: Tema Óptico */}
          <section className="space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-sm text-taiada-dark dark:text-white">
              <Sun className="w-4 h-4 text-taiada-primary" />
              <h3>Tema Visual & Contraste</h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  theme === 'light'
                    ? 'border-taiada-primary bg-taiada-primary/10 text-taiada-primary font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Sun className="w-5 h-5 mb-1" />
                <span className="text-[11px]">Claro</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  theme === 'dark'
                    ? 'border-taiada-primary bg-taiada-primary/10 text-taiada-primary font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Moon className="w-5 h-5 mb-1" />
                <span className="text-[11px]">Escuro</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('high-contrast')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 ${
                  theme === 'high-contrast'
                    ? 'border-taiada-primary bg-taiada-primary/10 text-taiada-primary font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Zap className="w-5 h-5 mb-1" />
                <span className="text-[11px]">Sol Forte</span>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              * O modo <strong>Sol Forte</strong> remove transparências e ativa bordas pretas sólidas
              para facilitar a leitura debaixo do sol nas ruas de Caçapava.
            </p>
          </section>

          {/* Seção 3: Economia de Dados 3G/4G */}
          <section className="space-y-3">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-black/5 dark:bg-black/30 border border-black/10 dark:border-white/10">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-1.5 font-bold text-taiada-dark dark:text-white">
                  {dataSaverMode ? (
                    <WifiOff className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Wifi className="w-4 h-4 text-taiada-primary" />
                  )}
                  <span>Modo Economia de Dados (3G/4G)</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                  Não carregar fotos automaticamente. Exibe botão sob demanda &quot;Carregar foto (~90 KB)&quot;
                  para economizar seu plano móvel.
                </p>
              </div>

              {/* Switch Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={dataSaverMode}
                onClick={() => setDataSaverMode(!dataSaverMode)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  dataSaverMode ? 'bg-taiada-primary' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    dataSaverMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Seção 4: Visualização Inicial Padrão */}
          <section className="space-y-3">
            <div className="font-bold text-sm text-taiada-dark dark:text-white">
              Visualização Padrão
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDefaultView('map')}
                className={`flex items-center gap-2 p-3 rounded-2xl border transition-all active:scale-95 ${
                  defaultView === 'map'
                    ? 'border-taiada-primary bg-taiada-primary/10 text-taiada-primary font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Map className="w-4 h-4" />
                <span>Mapa de Caçapava</span>
              </button>

              <button
                type="button"
                onClick={() => setDefaultView('list')}
                className={`flex items-center gap-2 p-3 rounded-2xl border transition-all active:scale-95 ${
                  defaultView === 'list'
                    ? 'border-taiada-primary bg-taiada-primary/10 text-taiada-primary font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400'
                }`}
              >
                <List className="w-4 h-4" />
                <span>Lista por Vias</span>
              </button>
            </div>
          </section>

          {/* Seção 5: Privacidade & Diagnóstico */}
          <section className="p-3.5 rounded-2xl bg-black/5 dark:bg-black/25 border border-black/10 dark:border-white/10 space-y-2">
            <div className="font-bold text-taiada-dark dark:text-white flex items-center justify-between">
              <span>Seu Identificador Anônimo:</span>
              <code className="text-[11px] px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono">
                {deviceHashShort}
              </code>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Assinatura criptográfica calculada sem dados pessoais para permitir seus votos e
              acompanhamento de protocolos.
            </p>

            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Deseja redefinir todas as preferências do app para os valores padrão?'
                  )
                ) {
                  clearAllPreferences();
                }
              }}
              className="mt-2 w-full py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Redefinir Preferências Locais</span>
            </button>
          </section>

          {/* Seção 6: Dados do Município */}
          <div className="text-center pt-2 text-[11px] text-gray-400 space-y-0.5">
            <p className="font-semibold text-gray-600 dark:text-gray-300">
              Taiada Fiscaliza • Caçapava - SP (IBGE 3508504)
            </p>
            <p>Plataforma Cívica Aberta sob Licença MIT • Versão 0.1.0</p>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 bg-gray-50 dark:bg-black/20 border-t border-black/10 dark:border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl font-bold text-xs bg-taiada-primary hover:bg-taiada-dark text-white active:scale-95 transition-all touch-manipulation"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
};
