/**
 * src/server/index.ts
 *
 * Servidor Unificado Express — Taiada Fiscaliza ("Cobra, Taiada!").
 * Monólito Modular de Alta Performance (Node.js v24 + TypeScript):
 * - Servidor de API REST (/api/issues, /api/admin)
 * - Rota Viral SSR para WhatsApp (/c/:id) e Card SVG (/api/og/:id.svg)
 * - Middleware de Identidade Zero-Auth (taiada_device_token + device_hash)
 * - Servidor de Arquivos Estáticos (.webp em /uploads e SPA em /dist)
 * - Fallback SPA para roteamento client-side
 * - Fechamento Seguro (Graceful Shutdown) com liberação do SQLite (WAL)
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { env } from '../config/env';
import { getDb, closeDb, initDatabase } from './db/index';
import { deviceIdentityMiddleware } from './middleware/deviceIdentity';
import { issuesRouter } from './routes/issues';
import { adminRouter } from './routes/admin';
import { shareRouter } from './routes/share';

/**
 * Cria e configura a aplicação Express com todos os middlewares, rotas e handlers.
 * Separada para permitir testes de integração com supertest sem abrir porta HTTP física.
 */
export function createServerApp(): express.Application {
  const app = express();

  // 1. Garante que o diretório de uploads sanitizados exista
  const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // 2. Middlewares de Segurança, Parsing e Cookies
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token'],
    })
  );

  app.use(cookieParser(env.DEVICE_SECRET));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 3. Servidor de Arquivos Estáticos (Fotos Sanitizadas e Assets Públicos)
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: true }));

  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { maxAge: '1d' }));
  }

  // 4. Middleware de Identidade Zero-Auth para todas as requisições
  app.use(deviceIdentityMiddleware);

  // 5. Health Check
  const healthHandler = (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const row = db.prepare('SELECT 1 as alive').get() as { alive: number };
      res.status(200).json({
        status: 'ok',
        app: 'taiada-fiscaliza',
        mode: env.VITE_APP_BRAND_MODE,
        database: row.alive === 1 ? 'connected' : 'error',
        uptime: Math.round(process.uptime()),
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
        error: err.message,
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // 6. Montagem das Rotas da API
  app.use('/api/issues', issuesRouter);
  app.use('/api/admin', adminRouter);

  // 7. Montagem das Rotas Virais (/c/:id e /api/og/:id.svg)
  app.use('/', shareRouter);

  // 8. Servidor da SPA (Arquivos compilados do Vite)
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
  }

  // 9. Fallback SPA para navegação client-side React
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Não intercepta rotas de API ou uploads não encontradas
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }

    const distIndex = path.resolve(distDir, 'index.html');
    if (fs.existsSync(distIndex)) {
      return res.sendFile(distIndex);
    }

    const rootIndex = path.resolve(process.cwd(), 'index.html');
    if (fs.existsSync(rootIndex)) {
      return res.sendFile(rootIndex);
    }

    res.status(404).send('Página não encontrada.');
  });

  // 10. Handler para Rotas de API inexistentes (404 JSON)
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Rota da API ${req.method} ${req.originalUrl} não foi encontrada.`,
    });
  });

  // 11. Middleware Central de Tratamento de Erros
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (env.NODE_ENV !== 'test') {
      console.error('[Taiada Fiscaliza - Server Error]:', err);
    }

    // Erros do Multer (Upload)
    if (err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'FILE_TOO_LARGE',
          message: 'A foto enviada excede o limite máximo permitido de 15MB.',
        });
        return;
      }
      res.status(400).json({
        error: 'UPLOAD_ERROR',
        message: `Falha no processamento do anexo: ${err.message}`,
      });
      return;
    }

    const status = err.status || err.statusCode || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message =
      env.NODE_ENV === 'production' && status === 500
        ? 'Ocorreu um erro interno no servidor.'
        : err.message || 'Erro inesperado.';

    res.status(status).json({
      error: code,
      message,
    });
  });

  return app;
}

// Instância padrão do app Express
export const app = createServerApp();

/**
 * Inicia o servidor HTTP escutando na porta configurada.
 */
export function startServer(customPort?: number): Server {
  const port = customPort || env.PORT;

  // Garante inicialização do banco SQLite e schema na subida
  initDatabase();

  const server = app.listen(port, () => {
    console.log(`
======================================================
  TAIADA FISCALIZA ("Cobra, Taiada!")
  Plataforma Cívica de Caçapava - SP (IBGE 3508504)
======================================================
  -> Servidor ativo em:      http://localhost:${port}
  -> Modo de Marca:          ${env.VITE_APP_BRAND_MODE}
  -> Ambiente:               ${env.NODE_ENV}
  -> Banco SQLite (WAL):     ${env.DATABASE_PATH}
  -> Uploads Sanitizados:    ${env.UPLOADS_DIR}
  -> URL Pública OpenGraph:  ${env.PUBLIC_BASE_URL}
======================================================
    `);
  });

  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\nRecebido sinal ${signal}. Encerrando servidor com segurança...`);
    server.close(() => {
      console.log('Conexões HTTP finalizadas.');
      closeDb();
      console.log('Banco de dados SQLite WAL desconectado.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Encerramento forçado por timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

/**
 * Determina se este módulo é o ponto de entrada principal executado via CLI (node/tsx)
 * e NÃO uma importação realizada por testes ou outros módulos.
 */
export function isMainModule(): boolean {
  if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    return false;
  }
  if (!process.argv || !process.argv[1]) {
    return false;
  }
  try {
    const scriptPath = path.resolve(process.argv[1]).replace(/\\/g, '/').toLowerCase();
    const currentPath = fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase();
    return (
      scriptPath === currentPath ||
      scriptPath.endsWith('/src/server/index.ts') ||
      scriptPath.endsWith('/src/server/index.js')
    );
  } catch {
    return false;
  }
}

// Inicialização automática apenas se for o ponto de entrada principal
if (isMainModule()) {
  startServer();
}

export default app;
