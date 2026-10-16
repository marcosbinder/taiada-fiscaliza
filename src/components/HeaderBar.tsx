/**
 * src/components/HeaderBar.tsx
 *
 * Cabeçalho Translúcido Flutuante com Apple Blur e Barra de Filtros Rápidos.
 * Diretrizes:
 * - Superfície translúcida: backdrop-filter: blur(20px) saturate(180%).
 * - Respeito à safe-area-inset-top para entalhes/Dynamic Island no iOS.
 * - Suporte dinâmico aos Modos A e B via AppPreferencesContext.
 * - Alternador Segmentado Apple (Mapa / Lista) com transição suave.
 * - Contador dinâmico de demandas ativas com pulso verde.
 * - Carrossel horizontal de filtros por categoria com física de toque active:scale-[0.96].
 */

import React from 'react';
import {
  Map,
  List,
  Settings,
  Shield,
  Hammer,
  Lightbulb,
  Trees,
  Footprints,
  TrafficCone,
  HeartPulse,
  GraduationCap,
  Bus,
  Layers,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { IssueCategory, ViewMode } from '../shared/types';
import { CATEGORIES_LIST } from '../shared/categories';

// Mapeamento dinâmico de ícones Lucide para as 8 categorias
const CATEGORY_ICON_COMPONENTS: Record<string, React.FC<{ className?: string }>> = {
  Hammer,
  Lightbulb,
  Trees,
  Footprints,
  TrafficCone,
  HeartPulse,
  GraduationCap,
  Bus,
};

export interface HeaderBarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  selectedCategory: IssueCategory | 'all';
  onSelectCategory: (cat: IssueCategory | 'all') => void;
  totalActiveIssues: number;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onResetView?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentView,
  onViewChange,
  selectedCategory,
  onSelectCategory,
  totalActiveIssues,
  onOpenSettings,
  onOpenAdmin,
  onResetView,
}) => {
  const { theme } = useAppPreferences();

  const isHighContrast = theme === 'high-contrast';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-colors duration-200 select-none ${
        isHighContrast
          ? 'bg-white border-b-2 border-taiada-dark'
          : 'bg-white/85 dark:bg-[#15301d]/90 backdrop-blur-xl border-b border-taiada-dark/10 dark:border-taiada-primary/30 shadow-sm'
      }`}
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        {/* Linha Superior: Logo, Segmented Control e Botões de Ação */}
        <div className="flex items-center justify-between h-14 gap-2">
          {/* Logo Oficial de Caçapava */}
          <div className="flex-shrink-0">
            <BrandLogo
              compact
              showSubtitle={false}
              onClick={onResetView}
              className="py-1"
            />
          </div>

          {/* Alternador Segmentado Apple (Mapa vs Lista) */}
          <nav
            aria-label="Alternar visualização"
            className="flex items-center p-1 rounded-xl bg-black/5 dark:bg-black/30 border border-taiada-dark/10 dark:border-taiada-primary/20 shadow-inner"
          >
            <button
              type="button"
              onClick={() => onViewChange('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ease-out active:scale-95 touch-manipulation ${
                currentView === 'map'
                  ? 'bg-white dark:bg-taiada-primary text-taiada-dark dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-taiada-dark dark:hover:text-white'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              <span>Mapa</span>
            </button>

            <button
              type="button"
              onClick={() => onViewChange('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ease-out active:scale-95 touch-manipulation ${
                currentView === 'list'
                  ? 'bg-white dark:bg-taiada-primary text-taiada-dark dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-taiada-dark dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </nav>

          {/* Área Direita: Badge de Demandas e Atalhos */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Badge de Demandas Ativas com Pulso */}
            <div
              title={`${totalActiveIssues} demandas ativas registradas em Caçapava`}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-taiada-primary/10 dark:bg-taiada-primary/25 text-taiada-primary dark:text-[#a7c7b0] border border-taiada-primary/20"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-taiada-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-taiada-primary" />
              </span>
              <span>{totalActiveIssues} ativas</span>
            </div>

            {/* Botão de Configurações */}
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Abrir Configurações"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-black/5 dark:bg-white/10 text-taiada-dark dark:text-white hover:bg-black/10 dark:hover:bg-white/20 active:scale-95 transition-all duration-100 ease-out touch-manipulation"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Botão de Painel Administrativo / Moderação */}
            <button
              type="button"
              onClick={onOpenAdmin}
              aria-label="Abrir Moderação Administrativa"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-black/5 dark:bg-white/10 text-taiada-dark dark:text-white hover:bg-black/10 dark:hover:bg-white/20 active:scale-95 transition-all duration-100 ease-out touch-manipulation"
            >
              <Shield className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Linha Inferior: Pílulas de Filtro por Categoria */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 -mx-1 px-1">
          {/* Pílula 'Todas' */}
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-100 ease-out active:scale-95 touch-manipulation border ${
              selectedCategory === 'all'
                ? 'bg-taiada-primary text-white border-taiada-primary shadow-sm shadow-taiada-primary/30'
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 border-transparent hover:bg-black/10 dark:hover:bg-white/15'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Todas</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                selectedCategory === 'all'
                  ? 'bg-white/25 text-white'
                  : 'bg-black/10 dark:bg-white/20 text-gray-600 dark:text-gray-300'
              }`}
            >
              {totalActiveIssues}
            </span>
          </button>

          {/* 8 Categorias Oficiais */}
          {CATEGORIES_LIST.map((cat) => {
            const Icon = CATEGORY_ICON_COMPONENTS[cat.iconName] || Hammer;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-100 ease-out active:scale-95 touch-manipulation border ${
                  isSelected
                    ? 'bg-taiada-primary text-white border-taiada-primary shadow-sm shadow-taiada-primary/30'
                    : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 border-transparent hover:bg-black/10 dark:hover:bg-white/15'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
