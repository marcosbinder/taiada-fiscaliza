/**
 * src/server/services/ogGenerator.ts
 *
 * Gerador de Cards Visuais Dinâmicos SVG e Metatags OpenGraph para WhatsApp ("Feito para o Zap").
 * Implementa ADR-008 e R6 ("Feito para o Zap"):
 * - Gera card SVG 1200x630 com design Apple nas cores oficiais Verde Taiada (#15301d e #347947).
 * - Monta metatags OpenGraph e Twitter Cards formatadas para grupos de WhatsApp de Caçapava.
 * - Injeta window.__INITIAL_ISSUE_ID__ no HTML da aplicação para deep-linking no mapa Leaflet.
 */

import { Issue, ResolutionStatus } from '../../shared/types';
import { CATEGORY_MAP, SEVERITY_LEVELS } from '../../shared/categories';
import { TAIADA_PALETTE, BRAND_CONFIGS } from '../../config/brand';

/**
 * Escapa com segurança caracteres especiais para inclusão em nós XML e atributos SVG.
 */
export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escapa caracteres para HTML seguro.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function getStatusLabel(status: ResolutionStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'open':
      return { label: 'Aberto', color: '#F4F7F5', bg: '#2D3748' };
    case 'verifying_resolution':
      return { label: 'Em Verificação Comunitária', color: '#15301d', bg: '#F6E05E' };
    case 'resolved_community':
    case 'resolved_official':
      return { label: 'Resolvido', color: '#FFFFFF', bg: '#347947' };
    case 'reopened':
      return { label: 'Reaberto • Problema Recorrente', color: '#FFFFFF', bg: '#E53E3E' };
    default:
      return { label: 'Aberto', color: '#F4F7F5', bg: '#2D3748' };
  }
}

export interface OgCardOptions {
  brandMode?: 'institucional' | 'imperativo';
  baseUrl?: string;
}

/**
 * Gera um card SVG puro de 1200x630 pixels com design Apple e cores oficiais Verde Taiada.
 */
export function generateOgSvg(issue: Issue, options?: OgCardOptions): string {
  const brandName =
    options?.brandMode === 'imperativo' ? BRAND_CONFIGS.imperativo.primaryName : BRAND_CONFIGS.institucional.primaryName;
  const brandSubtitle =
    options?.brandMode === 'imperativo' ? BRAND_CONFIGS.imperativo.subtitle : BRAND_CONFIGS.institucional.subtitle;

  const categoryDef = CATEGORY_MAP[issue.category];
  const categoryLabel = categoryDef ? categoryDef.label : issue.category;
  const statusInfo = getStatusLabel(issue.resolution_status);
  const truncatedTitle = truncate(issue.title, 55);
  const truncatedStreet = truncate(`${issue.street_name}, ${issue.neighborhood}`, 60);

  // Construção dos indicadores de gravidade (1 a 5)
  const severityDots = [1, 2, 3, 4, 5]
    .map((level) => {
      const isFilled = level <= issue.severity;
      const fillColor = isFilled
        ? issue.severity >= 4
          ? '#E53E3E'
          : issue.severity === 3
          ? '#DD6B20'
          : '#347947'
        : 'rgba(255, 255, 255, 0.2)';
      const cx = 950 + level * 20;
      return `<circle cx="${cx}" cy="225" r="7" fill="${fillColor}" />`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradiente Oficial Verde Taiada -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#15301d" />
      <stop offset="60%" stop-color="#0B1910" />
      <stop offset="100%" stop-color="#050B07" />
    </linearGradient>

    <!-- Gradiente do Emblema -->
    <linearGradient id="emblemGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#347947" />
      <stop offset="100%" stop-color="#15301d" />
    </linearGradient>

    <!-- Brilho Translúcido -->
    <radialGradient id="glow" cx="0.8" cy="0.2" r="0.6">
      <stop offset="0%" stop-color="#347947" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#347947" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Fundo com Gradiente Profundo -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />
  <rect width="1200" height="630" fill="url(#glow)" />

  <!-- Moldura Apple Translúcida -->
  <rect x="40" y="40" width="1120" height="550" rx="32" fill="rgba(255, 255, 255, 0.03)" stroke="#347947" stroke-width="2" stroke-opacity="0.4" />

  <!-- Topo: Emblema e Identidade -->
  <g transform="translate(80, 80)">
    <!-- Escudo / Pino Vetorial -->
    <rect width="56" height="56" rx="16" fill="url(#emblemGrad)" stroke="#347947" stroke-width="2" />
    <path d="M28 16C22.48 16 18 20.48 18 26C18 33.5 28 42 28 42C28 42 38 33.5 38 26C38 20.48 33.52 16 28 16ZM28 29.5C26.07 29.5 24.5 27.93 24.5 26C24.5 24.07 26.07 22.5 28 22.5C29.93 22.5 31.5 24.07 31.5 26C31.5 27.93 29.93 29.5 28 29.5Z" fill="#F4F7F5" />

    <text x="72" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#F4F7F5" letter-spacing="1.5">${escapeXml(brandName.toUpperCase())}</text>
    <text x="72" y="48" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#A3B899" letter-spacing="0.5">${escapeXml(brandSubtitle)}</text>
  </g>

  <!-- Badge Protocolo Oficial (Canto Superior Direito) -->
  <g transform="translate(870, 80)">
    <rect width="250" height="48" rx="24" fill="rgba(52, 121, 71, 0.2)" stroke="#347947" stroke-width="1.5" />
    <text x="125" y="30" font-family="-apple-system, BlinkMacSystemFont, 'SF Mono', Consolas, monospace" font-size="18" font-weight="700" fill="#A3B899" text-anchor="middle">${escapeXml(issue.id)}</text>
  </g>

  <!-- Badges de Categoria e Gravidade -->
  <g transform="translate(80, 200)">
    <!-- Categoria Badge -->
    <rect width="320" height="42" rx="21" fill="rgba(52, 121, 71, 0.3)" stroke="#347947" stroke-width="1" />
    <text x="20" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="700" fill="#F4F7F5">${escapeXml(categoryLabel)}</text>

    <!-- Gravidade -->
    <text x="730" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="700" fill="#A3B899">Gravidade ${issue.severity}/5:</text>
    ${severityDots}
  </g>

  <!-- Título do Chamado -->
  <text x="80" y="320" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="800" fill="#FFFFFF" letter-spacing="-0.5">
    ${escapeXml(truncatedTitle)}
  </text>

  <!-- Localização com Ícone de Pino -->
  <g transform="translate(80, 375)">
    <circle cx="16" cy="16" r="16" fill="rgba(52, 121, 71, 0.25)" />
    <path d="M16 8C12.69 8 10 10.69 10 14C10 18.5 16 23.5 16 23.5C16 23.5 22 18.5 22 14C22 10.69 19.31 8 16 8ZM16 16C14.9 16 14 15.1 14 14C14 12.9 14.9 12 16 12C17.1 12 18 12.9 18 14C18 15.1 17.1 16 16 16Z" fill="#347947" />
    <text x="44" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="600" fill="#E2E8F0">📍 ${escapeXml(truncatedStreet)} — Caçapava - SP</text>
  </g>

  <!-- Barra de Estatísticas Comunitárias e Apoios -->
  <g transform="translate(80, 450)">
    <!-- Apoios -->
    <rect width="280" height="54" rx="27" fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
    <text x="30" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="18" font-weight="700" fill="#347947">👥 ${issue.upvotes_count} moradores</text>
    <text x="175" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="15" font-weight="500" fill="#A3B899">apoiaram</text>

    <!-- Status Atual -->
    <rect x="300" y="0" width="340" height="54" rx="27" fill="${statusInfo.bg}" opacity="0.9" />
    <text x="470" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" font-weight="700" fill="${statusInfo.color}" text-anchor="middle">${statusInfo.label}</text>
  </g>

  <!-- Rodapé Institucional -->
  <line x1="80" y1="535" x2="1120" y2="535" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
  <text x="80" y="562" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="500" fill="#718096">
    Plataforma Cívica Zero-Auth • Sem cadastro ou senha • Caçapava - SP (IBGE 3508504)
  </text>
  <text x="1120" y="562" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="700" fill="#347947" text-anchor="end">
    Toque para fiscalizar no WhatsApp
  </text>
</svg>
`;
}

// Alias para compatibilidade
export const generateOgCardSvg = generateOgSvg;

export interface OgMetadata {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  tagsHtml: string;
}

/**
 * Monta as metatags OpenGraph e Twitter Cards formatadas.
 */
export function buildOgMetaTags(issue: Issue, baseUrl: string): OgMetadata {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  // Título oficial conforme docs/04: 📍 [Bairro] ([Rua]) — [Título] | Taiada Fiscaliza (Caçapava)
  const title = `📍 ${issue.neighborhood} (${issue.street_name}) — ${issue.title} | Taiada Fiscaliza (Caçapava)`;

  // Descrição oficial: Cobra, Taiada! Gravidade [N]/5 • [X] moradores já confirmaram este problema...
  const description = `Cobra, Taiada! Gravidade ${issue.severity}/5 • ${issue.upvotes_count} moradores já confirmaram este problema. Clique para apoiar ou informar se já foi resolvido (não precisa de cadastro).`;

  // Imagem: foto limpa WebP ou SVG dinâmico
  const imageUrl = issue.photo_url
    ? `${cleanBaseUrl}${issue.photo_url.startsWith('/') ? '' : '/'}${issue.photo_url}`
    : `${cleanBaseUrl}/api/og/${issue.id}.svg`;

  const url = `${cleanBaseUrl}/c/${issue.id}`;

  const tagsHtml = `
    <!-- OpenGraph & WhatsApp Metatags -->
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(issue.title)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Taiada Fiscaliza • Cobra, Taiada!" />
    <meta property="og:locale" content="pt_BR" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapeHtml(url)}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  `.trim();

  return { title, description, imageUrl, url, tagsHtml };
}

export function generateOgHtmlMeta(
  issue: Issue,
  baseUrl: string,
  brandMode: 'institucional' | 'imperativo' = 'institucional'
) {
  const brandTitle = brandMode === 'imperativo' ? BRAND_CONFIGS.imperativo.primaryName : BRAND_CONFIGS.institucional.primaryName;
  const title = `📍 ${issue.neighborhood} (${issue.street_name}) — ${issue.title} | ${brandTitle} (Caçapava)`;
  const description = `Cobra, Taiada! Gravidade ${issue.severity}/5 • ${issue.upvotes_count} moradores de Caçapava já confirmaram este problema. Clique para ver fotos, apoiar ou informar se já foi resolvido (sem cadastro).`;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const imageUrl = issue.photo_url
    ? `${cleanBaseUrl}${issue.photo_url.startsWith('/') ? '' : '/'}${issue.photo_url}`
    : `${cleanBaseUrl}/api/og/${issue.id}.svg`;
  const url = `${cleanBaseUrl}/c/${issue.id}`;

  return { title, description, imageUrl, url, brandTitle };
}

/**
 * Injeta tags OpenGraph e window.__INITIAL_ISSUE_ID__ no HTML da SPA.
 */
export function injectOgIntoHtml(htmlTemplate: string, issue: Issue, baseUrl: string): string {
  const og = buildOgMetaTags(issue, baseUrl);

  // Script com deep-linking para SPA
  const scriptTag = `<script>window.__INITIAL_ISSUE_ID__ = ${JSON.stringify(issue.id)};</script>`;

  let html = htmlTemplate;

  // Substitui ou injeta <title>
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(og.title)}</title>`);
  }

  // Remove meta description genérica anterior se existir
  html = html.replace(/<meta\s+name=["']description["'][\s\S]*?>/gi, '');

  // Injeta tags OG antes de </head>
  const headInjection = `\n    ${og.tagsHtml}\n    ${scriptTag}\n  </head>`;
  html = html.replace(/<\/head>/i, headInjection);

  return html;
}

/**
 * Fallback HTML enriquecido para IDs inexistentes (404)
 */
export function generateFallbackOgHtml(id: string, baseUrl: string, htmlTemplate?: string): string {
  const title = `Demanda não encontrada | Taiada Fiscaliza (Caçapava)`;
  const description = `A demanda ${escapeHtml(id)} não foi encontrada ou foi removida. Acesse o Taiada Fiscaliza para acompanhar as zeladorias ativas de Caçapava - SP.`;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const imageUrl = `${cleanBaseUrl}/favicon.svg`;

  if (htmlTemplate) {
    const metaTags = `
      <title>${escapeHtml(title)}</title>
      <meta name="description" content="${escapeHtml(description)}" />
      <meta property="og:title" content="${escapeHtml(title)}" />
      <meta property="og:description" content="${escapeHtml(description)}" />
      <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    `.trim();

    let html = htmlTemplate;
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    }
    return html.replace(/<\/head>/i, `\n    ${metaTags}\n  </head>`);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0B1910; color: #F4F7F5; padding: 40px; text-align: center;">
  <h1 style="color: #347947;">Demanda não encontrada</h1>
  <p>${escapeHtml(description)}</p>
  <p><a href="/" style="color: #347947; text-decoration: underline;">Voltar ao Mapa de Caçapava</a></p>
</body>
</html>`;
}
