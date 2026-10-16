/**
 * src/components/BrandLogo.tsx
 *
 * Componente Oficial de Marca com Detecção Assíncrona de Logotipo e Fallback Vetorial Apple.
 * Diretrizes:
 * 1. Tenta carregar /logo.svg e /logo.png com cache em sessão.
 * 2. Enquanto ausentes, renderiza automaticamente o Emblema Vetorial Minimalista Apple:
 *    - Contêiner rounded-2xl com gradiente linear 135deg (#15301d -> #347947);
 *    - Escudo de proteção cívica e megafone em branco puro (#FFFFFF);
 *    - Tipografia institucional de Caçapava 'Taiada Fiscaliza' ou 'Cobra, Taiada!'.
 * 3. Física de toque Apple: active:scale-[0.98] transition-transform duration-100 ease-out.
 */

import React, { useState, useEffect } from 'react';
import { useAppPreferences } from '../context/AppPreferencesContext';

// Cache em memória na sessão para evitar requisições repetidas ao trocar de tela
let cachedLogoType: 'svg' | 'png' | 'fallback' | null = null;
let isCheckingLogo = false;
const checkListeners: Array<(type: 'svg' | 'png' | 'fallback') => void> = [];

function checkLogoExistence(): Promise<'svg' | 'png' | 'fallback'> {
  if (cachedLogoType) {
    return Promise.resolve(cachedLogoType);
  }

  return new Promise((resolve) => {
    checkListeners.push(resolve);

    if (isCheckingLogo) return;
    isCheckingLogo = true;

    // Função auxiliar para testar se uma imagem existe
    const testImage = (url: string): Promise<boolean> => {
      return new Promise((res) => {
        const img = new Image();
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = url;
      });
    };

    // Testa /logo.svg primeiro, depois /logo.png
    testImage('/logo.svg').then((svgExists) => {
      if (svgExists) {
        cachedLogoType = 'svg';
        checkListeners.forEach((cb) => cb('svg'));
        checkListeners.length = 0;
        return;
      }

      testImage('/logo.png').then((pngExists) => {
        cachedLogoType = pngExists ? 'png' : 'fallback';
        checkListeners.forEach((cb) => cb(cachedLogoType!));
        checkListeners.length = 0;
      });
    });
  });
}

export interface BrandLogoProps {
  compact?: boolean;
  showSubtitle?: boolean;
  className?: string;
  iconSize?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  compact = false,
  showSubtitle = true,
  className = '',
  iconSize = 'md',
  onClick,
}) => {
  const { brandConfig } = useAppPreferences();
  const [logoType, setLogoType] = useState<'svg' | 'png' | 'fallback'>(
    cachedLogoType || 'fallback'
  );

  useEffect(() => {
    let mounted = true;
    checkLogoExistence().then((type) => {
      if (mounted) {
        setLogoType(type);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Dimensões do ícone
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-xl',
    md: 'w-10 h-10 rounded-2xl',
    lg: 'w-14 h-14 rounded-3xl',
  }[iconSize];

  const svgInnerSize = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }[iconSize];

  const titleSizeClass = compact
    ? 'text-base font-bold'
    : iconSize === 'lg'
    ? 'text-2xl font-black'
    : 'text-lg font-extrabold';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`inline-flex items-center gap-3 select-none ${
        onClick
          ? 'cursor-pointer active:scale-[0.98] transition-transform duration-100 ease-out touch-manipulation'
          : ''
      } ${className}`}
    >
      {/* Contêiner da Logo ou Emblema Fallback Apple */}
      <div
        className={`relative flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md shadow-taiada-primary/20 border border-white/20 ${sizeClasses}`}
        style={{
          background: 'linear-gradient(135deg, #15301d 0%, #347947 100%)',
        }}
      >
        {logoType === 'svg' ? (
          <img
            src="/logo.svg"
            alt={brandConfig.primaryName}
            className="w-full h-full object-contain p-1"
          />
        ) : logoType === 'png' ? (
          <img
            src="/logo.png"
            alt={brandConfig.primaryName}
            className="w-full h-full object-contain p-1"
          />
        ) : (
          /* Emblema Vetorial Minimalista Apple: Escudo Cívico + Megafone */
          <svg
            className={`${svgInnerSize} text-white drop-shadow-sm`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Escudo / Pino Cívico */}
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            {/* Megafone / Voz Popular de Caçapava */}
            <path
              d="M9 10h2l3-2v6l-3-2H9a1 1 0 0 1-1-1v-0a1 1 0 0 1 1-1z"
              fill="white"
              stroke="none"
            />
            <path d="M16 9.5a3 3 0 0 1 0 5" strokeWidth="1.5" />
          </svg>
        )}
      </div>

      {/* Tipografia Oficial da Marca */}
      <div className="flex flex-col text-left leading-tight">
        <div className="flex items-center gap-1.5">
          <span
            className={`${titleSizeClass} tracking-tight text-taiada-dark dark:text-taiada-lightBg`}
          >
            {brandConfig.primaryName}
          </span>
          {compact && (
            <span className="hidden xs:inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-taiada-primary/15 text-taiada-primary dark:text-[#a7c7b0]">
              Caçapava
            </span>
          )}
        </div>

        {showSubtitle && (
          <span className="text-[11px] sm:text-xs font-medium text-taiada-primary dark:text-[#a7c7b0] line-clamp-1">
            {brandConfig.subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
