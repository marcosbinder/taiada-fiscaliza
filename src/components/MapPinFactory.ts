/**
 * src/components/MapPinFactory.ts
 *
 * Fábrica de Pinos Customizados SVG para Leaflet (L.divIcon)
 * Taiada Fiscaliza ("Cobra, Taiada!") — Caçapava - SP.
 *
 * Características Técnicas:
 * 1. 100% SVG vetorial nativo (zero dependência de assets PNG do Leaflet).
 * 2. Estilização por Categoria (8 cores oficiais) e Gravidade (escala 1 a 5 com redimensionamento físico e anel de pulso).
 * 3. Anel de Status Dinâmico:
 *    - Aberto (open): Verde Taiada #347947
 *    - Em Verificação (verifying_resolution): Âmbar #f59e0b com pulso
 *    - Resolvido (resolved_community / resolved_official): Esmeralda #059669 com badge de check
 *    - Reaberto (reopened): Vermelho #dc2626 com anel duplo e pulso de alerta urgente
 * 4. Pinos Numerados (#1, #2, #3, ...) para demandas integrantes de Dossiês de Rua.
 * 5. Badge de Apoio Comunitário (▲ upvotes_count) integrado diretamente ao pino.
 * 6. Pino Especial Arrastável para Ajuste Fino de Localização com mira circular e tooltip.
 */

import * as L from 'leaflet';
import { Issue, IssueCategory, IssueSeverity, ResolutionStatus } from '../shared/types';
import { CATEGORY_MAP } from '../shared/categories';

// ==========================================
// 1. Ícones SVG Puros por Categoria
// ==========================================

const CATEGORY_SVGS: Record<IssueCategory, string> = {
  buracos_vias: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 3.26-1.25-1.25a2 2 0 0 0-2.83 0l-1.8 1.8 4.07 4.08 1.81-1.8a2 2 0 0 0 0-2.83Z" />
    </svg>
  `,
  iluminacao: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  `,
  limpeza_mato: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z" />
      <path d="M7 16v6" />
      <path d="M13 19v3" />
      <path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7l-3.3-4.6a1 1 0 0 0-1.4 0L9 7.3" />
    </svg>
  `,
  calcadas_acessibilidade: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="M4 16v-2.38C4 11.5 6.01 9.5 8.5 9.5h7c2.49 0 4.5 2 4.5 4.12V16" />
      <path d="M8 20v-4" />
      <path d="M16 20v-4" />
      <circle cx="12" cy="5" r="2" />
    </svg>
  `,
  sinalizacao_transito: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="m8 2 1.88 7.5a6 6 0 0 0 8.24 0L20 2" />
      <path d="M2 20h20" />
      <path d="m5 20 2-8h10l2 8" />
    </svg>
  `,
  saude: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M12 7v6" />
      <path d="M9 10h6" />
    </svg>
  `,
  educacao: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  `,
  transporte: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-full h-full">
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.6 19.1 6 18 6H4c-1.1 0-2.1.6-2.4 1.8L.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3" />
      <circle cx="7" cy="18" r="2" />
      <path d="M9 18h5" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  `,
};

// ==========================================
// 2. Cores e Estilos de Status
// ==========================================

export interface StatusVisualConfig {
  ringColor: string;
  glowColor: string;
  badgeLabel: string;
  pulseClass: string;
  iconExtraSvg?: string;
}

export function getStatusVisual(status: ResolutionStatus): StatusVisualConfig {
  switch (status) {
    case 'verifying_resolution':
      return {
        ringColor: '#f59e0b', // Âmbar
        glowColor: 'rgba(245, 158, 11, 0.45)',
        badgeLabel: 'Em Verificação',
        pulseClass: 'taiada-pulse-amber',
        iconExtraSvg: `
          <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-black shadow">
            ⏱
          </div>
        `,
      };
    case 'resolved_community':
    case 'resolved_official':
      return {
        ringColor: '#059669', // Esmeralda Verde
        glowColor: 'rgba(5, 150, 105, 0.45)',
        badgeLabel: 'Resolvido',
        pulseClass: '',
        iconExtraSvg: `
          <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow">
            ✓
          </div>
        `,
      };
    case 'reopened':
      return {
        ringColor: '#dc2626', // Vermelho Crítico
        glowColor: 'rgba(220, 38, 38, 0.65)',
        badgeLabel: 'Reaberto',
        pulseClass: 'taiada-pulse-red',
        iconExtraSvg: `
          <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black shadow">
            !
          </div>
        `,
      };
    case 'open':
    default:
      return {
        ringColor: '#347947', // Verde Taiada Vivo
        glowColor: 'rgba(52, 121, 71, 0.35)',
        badgeLabel: 'Aberto',
        pulseClass: '',
      };
  }
}

// ==========================================
// 3. Dimensões por Gravidade (1..5)
// ==========================================

export function getSeverityPinDimensions(severity: IssueSeverity): {
  size: number;
  iconSize: number;
  hasCriticalPing: boolean;
} {
  switch (severity) {
    case 5:
      return { size: 48, iconSize: 22, hasCriticalPing: true };
    case 4:
      return { size: 44, iconSize: 20, hasCriticalPing: false };
    case 3:
      return { size: 40, iconSize: 18, hasCriticalPing: false };
    case 2:
      return { size: 36, iconSize: 16, hasCriticalPing: false };
    case 1:
    default:
      return { size: 34, iconSize: 15, hasCriticalPing: false };
  }
}

// ==========================================
// 4. Criação de DivIcon de Demanda Individual
// ==========================================

export interface CreatePinOptions {
  issue: Issue;
  isSelected?: boolean;
  dossierPointNumber?: number; // #1, #2, #3...
}

export function createIssueDivIcon(options: CreatePinOptions): L.DivIcon {
  const { issue, isSelected = false, dossierPointNumber } = options;
  const categoryDef = CATEGORY_MAP[issue.category] || CATEGORY_MAP.buracos_vias;
  const statusVisual = getStatusVisual(issue.resolution_status);
  const { size, iconSize, hasCriticalPing } = getSeverityPinDimensions(issue.severity);

  // Escala para selecionado
  const finalSize = isSelected ? Math.round(size * 1.15) : size;
  const catColor = categoryDef.color;
  const svgContent = CATEGORY_SVGS[issue.category] || CATEGORY_SVGS.buracos_vias;

  // Dossiê Badge (#1, #2, etc.)
  const dossierBadgeHtml = dossierPointNumber
    ? `
      <div class="absolute -top-2 -left-2 bg-taiada-dark text-white text-[11px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-md z-20 flex items-center justify-center min-w-[20px] h-[20px]">
        #${dossierPointNumber}
      </div>
    `
    : '';

  // Badge de Apoio / Votos (▲ 18)
  const upvoteBadgeHtml = `
    <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white dark:bg-taiada-dark text-taiada-dark dark:text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-taiada-dark/20 shadow-md whitespace-nowrap z-20 flex items-center gap-0.5">
      <span class="text-taiada-primary font-black">▲</span>
      <span>${issue.upvotes_count}</span>
    </div>
  `;

  // Anel de Pulso de Alerta (Crítica ou Reaberto)
  const pingRingHtml =
    hasCriticalPing || issue.resolution_status === 'reopened'
      ? `
      <span class="absolute inset-0 rounded-full animate-ping opacity-60 pointer-events-none" style="background-color: ${
        issue.resolution_status === 'reopened' ? '#dc2626' : catColor
      };"></span>
    `
      : '';

  const selectedRingClass = isSelected
    ? 'ring-4 ring-offset-2 ring-taiada-primary shadow-2xl scale-110'
    : 'hover:scale-105 active:scale-95';

  const html = `
    <div class="taiada-marker-wrapper relative flex items-center justify-center cursor-pointer transition-transform duration-150 select-none ${selectedRingClass}" style="width: ${finalSize}px; height: ${finalSize}px;">
      ${pingRingHtml}
      ${dossierBadgeHtml}

      <!-- Corpo Principal do Pino (Escudo / Bolha com Ponta Suave) -->
      <div
        class="taiada-pin-bubble relative w-full h-full rounded-2xl flex items-center justify-center shadow-lg transition-all"
        style="
          background: linear-gradient(135deg, ${catColor} 0%, ${catColor}dd 100%);
          border: 2.5px solid ${statusVisual.ringColor};
          box-shadow: 0 4px 14px ${statusVisual.glowColor};
          color: #ffffff;
        "
      >
        <div style="width: ${iconSize}px; height: ${iconSize}px; color: #ffffff;">
          ${svgContent}
        </div>
        ${statusVisual.iconExtraSvg || ''}
      </div>

      <!-- Seta indicadora inferior apontando para as coordenadas -->
      <div
        class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] transition-colors"
        style="border-t-color: ${statusVisual.ringColor};"
      ></div>

      ${upvoteBadgeHtml}
    </div>
  `;

  return L.divIcon({
    className: 'taiada-custom-leaflet-pin',
    html,
    iconSize: [finalSize, finalSize + 8],
    iconAnchor: [finalSize / 2, finalSize + 4],
    popupAnchor: [0, -finalSize - 4],
  });
}

// ==========================================
// 5. Pino Especial Arrastável (Ajuste Fino de Localização)
// ==========================================

export interface CreateDraggablePinOptions {
  streetName?: string;
  isWithinBounds?: boolean;
}

export function createDraggablePinIcon(options: CreateDraggablePinOptions): L.DivIcon {
  const { streetName = 'Ajuste o local', isWithinBounds = true } = options;

  const borderColor = isWithinBounds ? '#347947' : '#dc2626';
  const bgColor = isWithinBounds ? '#15301d' : '#991b1b';
  const labelText = isWithinBounds ? streetName : '⚠️ Fora de Caçapava';

  const html = `
    <div class="taiada-drag-pin-container relative flex flex-col items-center justify-center pointer-events-auto select-none">
      <!-- Tooltip Flutuante Superior -->
      <div
        class="absolute -top-11 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-xl flex items-center gap-1.5 animate-bounce"
        style="background-color: ${bgColor}; border: 1.5px solid ${borderColor};"
      >
        <span>📍</span>
        <span class="max-w-[180px] truncate">${labelText}</span>
      </div>

      <!-- Pino Estilo Alvo -->
      <div class="relative w-12 h-12 flex items-center justify-center">
        <!-- Pulso de radar ao redor da mira -->
        <span class="absolute inset-0 rounded-full animate-ping opacity-40" style="background-color: ${borderColor};"></span>

        <!-- Círculo central com mira -->
        <div
          class="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-2xl transition-transform active:scale-125"
          style="background: ${bgColor}; border: 3px solid #ffffff; box-shadow: 0 0 16px ${borderColor};"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5 text-white">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </div>
      </div>

      <!-- Mira inferior no ponto exato -->
      <div class="w-3 h-3 rounded-full border-2 border-white bg-taiada-primary shadow-md -mt-1.5"></div>
    </div>
  `;

  return L.divIcon({
    className: 'taiada-draggable-custom-pin',
    html,
    iconSize: [48, 70],
    iconAnchor: [24, 62],
  });
}

// ==========================================
// 6. Pino de Localização Atual do Cidadão (GPS Live)
// ==========================================

export function createUserLocationIcon(): L.DivIcon {
  const html = `
    <div class="relative flex items-center justify-center w-7 h-7">
      <span class="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-40"></span>
      <div class="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center">
        <div class="w-2 h-2 rounded-full bg-white"></div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'taiada-user-location-pin',
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
