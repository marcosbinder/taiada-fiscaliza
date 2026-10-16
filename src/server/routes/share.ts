/**
 * src/server/routes/share.ts
 *
 * Rotas de Compartilhamento Viral e SSR para WhatsApp.
 * Endpoints:
 * 1. GET /c/:id
 *    - SSR com injeção dinâmica de metatags OpenGraph (og:title, og:description, og:image)
 *    - Injeção de window.__INITIAL_ISSUE_ID__ para que a SPA React abra centralizada no pino.
 *    - Tratamento amigável para crawlers do WhatsApp, Facebook, Telegram e Twitterbot.
 * 2. GET /api/og/:id.svg (e alias GET /api/og/:id)
 *    - Entrega do card vetorial dinâmico em SVG com a paleta Verde Taiada (#15301d / #347947).
 */

import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/index';
import { env } from '../../config/env';
import type { Issue } from '../../shared/types';
import {
  generateOgSvg,
  injectOgIntoHtml,
  generateFallbackOgHtml,
} from '../services/ogGenerator';

export const shareRouter = Router();

// Cache em memória do template base index.html para produção
let cachedIndexHtml: string | null = null;

function getBaseHtmlTemplate(): string {
  // Em produção, usa dist/index.html gerado pelo Vite build se existir
  const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(distIndexPath)) {
    return fs.readFileSync(distIndexPath, 'utf-8');
  }

  // Em desenvolvimento, usa index.html da raiz
  const rootIndexPath = path.resolve(process.cwd(), 'index.html');
  if (fs.existsSync(rootIndexPath)) {
    return fs.readFileSync(rootIndexPath, 'utf-8');
  }

  // Fallback mínimo de emergência
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Taiada Fiscaliza • Cobra, Taiada!</title>
</head>
<body class="bg-taiada-lightBg text-taiada-dark">
  <div id="root"></div>
</body>
</html>`;
}

/**
 * GET /c/:id
 * Rota curta de compartilhamento para WhatsApp com SSR de OpenGraph e deep-linking na SPA.
 */
shareRouter.get('/c/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || typeof id !== 'string') {
    res.status(400).send('ID de chamado inválido.');
    return;
  }

  const cleanId = id.trim().toUpperCase();
  const db = getDb();

  // Consulta o chamado pelo ID
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(cleanId) as Issue | undefined;

  // Carrega template HTML
  const templateHtml = (env.NODE_ENV === 'production' && cachedIndexHtml) ? cachedIndexHtml : getBaseHtmlTemplate();
  if (env.NODE_ENV === 'production' && !cachedIndexHtml) {
    cachedIndexHtml = templateHtml;
  }

  // Se não existir, retorna 404 com HTML enriquecido
  if (!issue) {
    const fallbackHtml = generateFallbackOgHtml(cleanId, env.PUBLIC_BASE_URL, templateHtml);
    res.status(404).type('html').send(fallbackHtml);
    return;
  }

  // Se estiver em shadowban e não for o próprio autor, oculta
  const requesterHash = req.device?.device_hash;
  if (issue.is_shadowbanned === 1 && issue.device_hash !== requesterHash) {
    const fallbackHtml = generateFallbackOgHtml(cleanId, env.PUBLIC_BASE_URL, templateHtml);
    res.status(404).type('html').send(fallbackHtml);
    return;
  }

  // Injeta tags OpenGraph e window.__INITIAL_ISSUE_ID__ no HTML
  const renderedHtml = injectOgIntoHtml(templateHtml, issue, env.PUBLIC_BASE_URL);

  res.status(200).type('html').send(renderedHtml);
});

/**
 * GET /api/og/:id.svg (e alias GET /api/og/:id)
 * Retorna o card visual dinâmico em SVG para preview em mensageiros ou visualização direta.
 */
shareRouter.get(['/api/og/:id.svg', '/api/og/:id'], (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.status(400).send('ID não fornecido.');
    return;
  }

  // Remove extensão .svg se presente
  const cleanId = id.replace(/\.svg$/i, '').trim().toUpperCase();
  const db = getDb();

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(cleanId) as Issue | undefined;

  if (!issue) {
    const fallbackSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0B1910" />
  <rect x="40" y="40" width="1120" height="550" rx="32" fill="#15301d" stroke="#347947" stroke-width="2" />
  <text x="600" y="280" font-family="-apple-system, sans-serif" font-size="42" font-weight="800" fill="#FFFFFF" text-anchor="middle">Demanda Não Encontrada</text>
  <text x="600" y="340" font-family="-apple-system, sans-serif" font-size="22" font-weight="500" fill="#A3B899" text-anchor="middle">O protocolo ${cleanId} não existe ou foi encerrado.</text>
  <text x="600" y="420" font-family="-apple-system, sans-serif" font-size="18" font-weight="700" fill="#347947" text-anchor="middle">Taiada Fiscaliza • Caçapava - SP</text>
</svg>`;

    res.status(404).setHeader('Content-Type', 'image/svg+xml; charset=utf-8').send(fallbackSvg);
    return;
  }

  const svgContent = generateOgSvg(issue);

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(svgContent);
});
