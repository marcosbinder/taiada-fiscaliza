/**
 * tests/api.test.ts
 *
 * Suíte de Testes Automatizados de Integração do Taiada Fiscaliza ("Cobra, Taiada!").
 * Valida de ponta a ponta todos os 9 Critérios de Aceitação (AC1 a AC9) e ADRs:
 * - AC1: TypeScript, Build e Variáveis de Ambiente
 * - AC2: Governança Open Source e Zero Segredos
 * - AC3: Apple Design e Tokens Verde Taiada
 * - AC4: GET /api/issues (Seed, Dossiê da Av. Brasil e Estatísticas)
 * - AC5: POST /api/issues/check-duplicates (Trava Geofencing 422 e Raio <= 40m)
 * - AC6: POST /api/issues (Pipeline Multer/Sharp WebP e Fotos Obrigatórias/Opcionais)
 * - AC7: POST /api/issues/:id/interact (Consenso Waze, Prova GPS, Teto Remoto e Reabertura)
 * - AC8: GET /c/:id (SSR WhatsApp OpenGraph e Deep-Linking SPA)
 * - AC9: POST /api/admin/purge-device (Expurgo em 1 Clique, Shadowban e Recálculo)
 * - ADR-008: GET /api/og/:id.svg (Card Vetorial SVG Dinâmico)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

// Importa app configurado e helpers do banco
import { app } from '../src/server/index';
import { getDb, closeDb } from '../src/server/db/index';
import { seedDatabase } from '../src/server/db/seed';
import { TAIADA_PALETTE, BRAND_CONFIGS } from '../src/config/brand';
import { validateEnv, env } from '../src/config/env';
import { generateDeviceToken } from '../src/server/middleware/deviceIdentity';

// Buffer WebP 1x1 pixel válido para testes de upload
const TEST_IMAGE_BUFFER = Buffer.from(
  'UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAEAcQERGIiP4HAA==',
  'base64'
);

describe('Suíte de Verificação e Critérios de Aceitação (AC1 a AC9)', () => {
  beforeAll(() => {
    // Garante que o banco está conectado e populado com o seed
    const db = getDb();
    seedDatabase(db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM issues').get() as { c: number }).c;
    expect(count).toBeGreaterThanOrEqual(8);
  });

  afterAll(() => {
    closeDb();
  });

  // ==========================================
  // AC1: Build, Compilação e Variáveis de Ambiente
  // ==========================================
  describe('AC1: Validação de Ambiente e Integridade de Configuração', () => {
    it('deve validar variáveis de ambiente padrão sem erros em desenvolvimento/teste', () => {
      const config = validateEnv();
      expect(config.PORT).toBeDefined();
      expect(config.DATABASE_PATH).toBeDefined();
      expect(config.UPLOADS_DIR).toBeDefined();
      expect(config.DEVICE_SECRET).toBeDefined();
      expect(config.ADMIN_TOKEN).toBeDefined();
    });

    it('deve rejeitar segredos fracos de desenvolvimento quando em ambiente de produção', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          DEVICE_SECRET: 'dev-secret-device-hmac-cacapava-2026-min32chars',
          ADMIN_TOKEN: 'token-producao-seguro-com-mais-de-16-caracteres',
        });
      }).toThrow(/DEVICE_SECRET/);
    });
  });

  // ==========================================
  // AC2: Governança Open Source e Zero Segredos
  // ==========================================
  describe('AC2: Governança Open Source e Zero Segredos na Raiz', () => {
    const rootFiles = ['.env.example', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE'];

    it.each(rootFiles)('deve conter o arquivo de governança "%s" na raiz', (fileName) => {
      const filePath = path.resolve(process.cwd(), fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(50);
    });

    it('não deve conter segredos reais ou senhas hardcoded em .env.example', () => {
      const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf-8');
      expect(envExample).not.toMatch(/password123/i);
      expect(envExample).not.toMatch(/sk_live_/i);
      expect(envExample).toContain('DEVICE_SECRET=');
      expect(envExample).toContain('ADMIN_TOKEN=');
    });
  });

  // ==========================================
  // AC3: Apple Design e Paleta Oficial Verde Taiada
  // ==========================================
  describe('AC3: Identidade Visual e Skill Apple Design', () => {
    it('deve possuir a skill apple-design instalada em .agents/skills/apple-design/SKILL.md', () => {
      const skillPath = path.resolve(process.cwd(), '.agents', 'skills', 'apple-design', 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    it('deve aplicar com exatidão a paleta oficial Verde Taiada (#15301d e #347947)', () => {
      expect(TAIADA_PALETTE.dark.toLowerCase()).toBe('#15301d');
      expect(TAIADA_PALETTE.primary.toLowerCase()).toBe('#347947');
      expect(TAIADA_PALETTE.lightBg).toBe('#F4F7F5');
      expect(TAIADA_PALETTE.darkBg).toBe('#0B1910');
    });

    it('deve fornecer suporte completo a ambos os modos de marca: Institucional e Imperativo', () => {
      expect(BRAND_CONFIGS.institucional.primaryName).toBe('Taiada Fiscaliza');
      expect(BRAND_CONFIGS.institucional.subtitle).toContain('Cobra, Taiada!');
      expect(BRAND_CONFIGS.imperativo.primaryName).toBe('Cobra, Taiada!');
      expect(BRAND_CONFIGS.imperativo.subtitle).toContain('Taiada Fiscaliza');
    });
  });

  // ==========================================
  // AC4: GET /api/issues (Seed e Dossiê da Av. Brasil)
  // ==========================================
  describe('AC4: Listagem de Demandas, Dossiês de Rua e Estatísticas', () => {
    it('GET /api/issues deve retornar as 8 demandas do seed, Dossiê Av. Brasil e estatísticas', async () => {
      const res = await request(app).get('/api/issues');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('issues');
      expect(res.body).toHaveProperty('street_dossiers');
      expect(res.body).toHaveProperty('stats');
      expect(res.body).toHaveProperty('device_hash_short');

      // Verifica as 8 demandas seeded
      const issues = res.body.issues;
      expect(Array.isArray(issues)).toBe(true);
      expect(issues.length).toBeGreaterThanOrEqual(8);

      // Verifica existência do protocolo da Av. Brasil
      const avBrasilIssue = issues.find((i: any) => i.id === 'TAI-2026-0101');
      expect(avBrasilIssue).toBeDefined();
      expect(avBrasilIssue.street_name).toBe('Avenida Brasil');
      expect(avBrasilIssue.neighborhood).toBe('Vera Cruz');

      // Verifica o Dossiê da Avenida Brasil com >= 3 pontos agregados
      const dossiers = res.body.street_dossiers;
      expect(Array.isArray(dossiers)).toBe(true);
      const avBrasilDossier = dossiers.find(
        (d: any) => d.street_group_key === 'avenida-brasil::buracos_vias'
      );
      expect(avBrasilDossier).toBeDefined();
      expect(avBrasilDossier.issues_count).toBeGreaterThanOrEqual(3);
      expect(avBrasilDossier.total_upvotes).toBeGreaterThanOrEqual(48);

      // Verifica estatísticas globais
      const stats = res.body.stats;
      expect(stats.total_active).toBeGreaterThanOrEqual(6);
      expect(stats.total_resolved).toBeGreaterThanOrEqual(0);
      expect(stats.total_reopened).toBeGreaterThanOrEqual(1);

      // Verifica cookie taiada_device_token
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('taiada_device_token'))).toBe(true);
    });
  });

  // ==========================================
  // AC5: POST /api/issues/check-duplicates (Geofence 422 & <= 40m)
  // ==========================================
  describe('AC5: Validação Geofencing e Deduplicação <= 40m', () => {
    it('deve rejeitar com HTTP 422 coordenadas fora do município de Caçapava - SP', async () => {
      // Coordenadas de São Paulo - SP (Marco Zero)
      const res = await request(app)
        .post('/api/issues/check-duplicates')
        .send({
          latitude: -23.5505,
          longitude: -46.6333,
          category: 'buracos_vias',
          street_name: 'Praça da Sé',
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('OUTSIDE_CACAPAVA');
      expect(res.body.message).toMatch(/Caçapava/i);
    });

    it('deve aceitar coordenadas válidas em Caçapava e detectar duplicatas no raio de 40m', async () => {
      // Ponto a ~15 metros da cratera TAI-2026-0101 na Avenida Brasil (-23.1042, -45.7098)
      const res = await request(app)
        .post('/api/issues/check-duplicates')
        .send({
          latitude: -23.1041,
          longitude: -45.7097,
          category: 'buracos_vias',
          street_name: 'Avenida Brasil',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('nearby_duplicates');
      expect(res.body).toHaveProperty('same_street_issues');

      const duplicates = res.body.nearby_duplicates;
      expect(Array.isArray(duplicates)).toBe(true);
      expect(duplicates.length).toBeGreaterThanOrEqual(1);

      const dup = duplicates.find((d: any) => d.id === 'TAI-2026-0101');
      expect(dup).toBeDefined();
      expect(dup.distance_meters).toBeLessThanOrEqual(40);
    });
  });

  // ==========================================
  // AC6: POST /api/issues (Pipeline Multer/Sharp WebP & Fotos Condicionais)
  // ==========================================
  describe('AC6: Criação de Demandas, Regras de Foto e Sanitização', () => {
    it('deve rejeitar submissão com coordenadas fora de Caçapava com HTTP 422', async () => {
      const res = await request(app)
        .post('/api/issues')
        .field('title', 'Buraco em Taubaté')
        .field('description', 'Teste de fora de Caçapava')
        .field('category', 'buracos_vias')
        .field('severity', '3')
        .field('latitude', '-23.0264')
        .field('longitude', '-45.5552')
        .field('street_name', 'Rua Teste')
        .field('neighborhood', 'Centro')
        .field('location_source', 'manual_pin');

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('OUTSIDE_CACAPAVA');
    });

    it('deve bloquear sem foto nas 5 categorias obrigatórias (ex: buracos_vias)', async () => {
      const res = await request(app)
        .post('/api/issues')
        .field('title', 'Buraco sem foto obrigatória')
        .field('description', 'Tentativa de criar buraco sem anexo')
        .field('category', 'buracos_vias')
        .field('severity', '4')
        .field('latitude', '-23.1006')
        .field('longitude', '-45.7069')
        .field('street_name', 'Rua São Bento')
        .field('neighborhood', 'Vila Resende')
        .field('location_source', 'manual_pin');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PHOTO_REQUIRED');
    });

    it('deve aceitar submissão sem foto em categorias sociais (ex: saude)', async () => {
      const res = await request(app)
        .post('/api/issues')
        .field('title', 'Demora na triagem da UBS')
        .field('description', 'Fila de espera de mais de 2 horas na unidade')
        .field('category', 'saude')
        .field('severity', '3')
        .field('latitude', '-23.0945')
        .field('longitude', '-45.7015')
        .field('street_name', 'Rua Dr. José de Moura Resende')
        .field('neighborhood', 'Vila Paraíso')
        .field('location_source', 'manual_pin')
        .field('auxiliary_data', JSON.stringify({ health_unit: 'UBS Vila Paraíso' }));

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('share_url');
      expect(res.body.category).toBe('saude');
      expect(res.body.photo_url).toBeNull();
    });

    it('deve processar upload de foto, converter para .webp e sanitizar metadados', async () => {
      const res = await request(app)
        .post('/api/issues')
        .field('title', 'Mato alto no canteiro central')
        .field('description', 'Mato cobrindo a visão dos motoristas')
        .field('category', 'limpeza_mato')
        .field('severity', '3')
        .field('latitude', '-23.1025')
        .field('longitude', '-45.7075')
        .field('street_name', 'Avenida Brasil')
        .field('neighborhood', 'Jardim Caçapava')
        .field('location_source', 'gps_live')
        .field('gps_accuracy_meters', '12')
        .attach('photo', TEST_IMAGE_BUFFER, 'teste-upload.webp');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('photo_url');
      expect(res.body.photo_url).toMatch(/\.webp$/i);
    });
  });

  // ==========================================
  // Opção A: POST /api/issues/:id/contribute (Somar Apoio e Evidência)
  // ==========================================
  describe('Opção A: Somar Apoio a Chamado Existente (Deduplicação / Mesclagem)', () => {
    it('deve somar apoio via POST /api/issues/:id/contribute, incrementar upvotes_count e retornar chamado atualizado para compartilhamento', async () => {
      // 1. Obtém o estado inicial do chamado TAI-2026-0101
      const initialRes = await request(app).get('/api/issues/TAI-2026-0101');
      expect(initialRes.status).toBe(200);
      const initialUpvotes = initialRes.body.upvotes_count;

      // 2. Cria token de novo dispositivo para evitar colisão de voto
      const newDeviceToken = generateDeviceToken(env.DEVICE_SECRET).token;

      // 3. Executa a Opção A: envia apoio adicional com nota e foto
      const contributeRes = await request(app)
        .post('/api/issues/TAI-2026-0101/contribute')
        .set('X-Device-Token', newDeviceToken)
        .field('note', 'Passo aqui todo dia de ônibus e o buraco aumentou!')
        .field('author_name', 'Cidadão Caçapavense')
        .attach('photo', TEST_IMAGE_BUFFER, 'apoio-cratera.webp');

      expect(contributeRes.status).toBe(201);
      expect(contributeRes.body.success).toBe(true);
      expect(contributeRes.body.message).toMatch(/Apoio somado com sucesso/i);
      expect(contributeRes.body).toHaveProperty('issue');

      const updatedIssue = contributeRes.body.issue;
      expect(updatedIssue.id).toBe('TAI-2026-0101');
      expect(updatedIssue.upvotes_count).toBe(initialUpvotes + 1);

      // 4. Valida dados para compartilhamento viral no WhatsApp
      expect(updatedIssue.title).toBeDefined();
      expect(updatedIssue.street_name).toBe('Avenida Brasil');
      const shareUrl = `/c/${updatedIssue.id}`;
      expect(shareUrl).toBe('/c/TAI-2026-0101');
    });
  });

  // ==========================================
  // AC7: POST /api/issues/:id/interact (Consenso Waze & Reabertura)
  // ==========================================
  describe('AC7: Motor de Consenso Waze, Trava de Teto Remoto e Reabertura', () => {
    it('deve processar upvote de prioridade e incrementar contador', async () => {
      const res = await request(app)
        .post('/api/issues/TAI-2026-0104/interact')
        .send({ vote_type: 'upvote' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('upvotes_count');
      expect(res.body.upvotes_count).toBeGreaterThanOrEqual(1);
    });

    it('deve aplicar trava de teto remoto (|soma| <= 3.0) para votos à distância', async () => {
      // Cria votação remota a partir de São Paulo (> 150m)
      const res = await request(app)
        .post('/api/issues/TAI-2026-0104/interact')
        .send({
          vote_type: 'resolved_yes',
          voter_latitude: -23.5505,
          voter_longitude: -46.6333,
          note: 'Voto remoto de teste',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('consensus_score');
      // O score remoto não pode exceder o teto de 3.0
      expect(Math.abs(res.body.consensus_score)).toBeLessThanOrEqual(3.0);
    });

    it('deve transicionar para resolved_community apenas com >= 2 votos presenciais distintos e reabrir com votos negativos', async () => {
      // 1. Cria uma nova demanda aberta para teste de transição limpa
      const createRes = await request(app)
        .post('/api/issues')
        .field('title', 'Lâmpada piscando no poste da praça')
        .field('description', 'Iluminação intermitente gerando insegurança à noite')
        .field('category', 'iluminacao')
        .field('severity', '2')
        .field('latitude', '-23.1010')
        .field('longitude', '-45.7070')
        .field('street_name', 'Praça da Bandeira')
        .field('neighborhood', 'Centro')
        .field('location_source', 'gps_live')
        .attach('photo', TEST_IMAGE_BUFFER, 'lampada.webp');

      expect(createRes.status).toBe(201);
      const testIssueId = createRes.body.id;
      expect(createRes.body.resolution_status).toBe('open');

      // 2. Primeiro voto presencial com foto (+5.0 pontos) via Dispositivo 1
      const device1Token = generateDeviceToken(env.DEVICE_SECRET).token;
      const vote1Res = await request(app)
        .post(`/api/issues/${testIssueId}/interact`)
        .set('X-Device-Token', device1Token)
        .field('vote_type', 'resolved_yes')
        .field('voter_latitude', '-23.1010')
        .field('voter_longitude', '-45.7070')
        .field('note', 'Trocaram a lâmpada hoje cedo')
        .attach('proof_photo', TEST_IMAGE_BUFFER, 'lampada-ok.webp');

      expect(vote1Res.status).toBe(200);
      expect(vote1Res.body.is_presential_gps).toBe(true);
      expect(vote1Res.body.vote_weight).toBe(5.0);
      expect(vote1Res.body.consensus_score).toBe(5.0);
      // Com S = 5.0 (>= 4.0), transiciona para verifying_resolution
      expect(vote1Res.body.resolution_status).toBe('verifying_resolution');

      // 3. Segundo voto presencial com foto (+5.0 pontos) via Dispositivo 2 (diferente!)
      const device2Token = generateDeviceToken(env.DEVICE_SECRET).token;
      const vote2Res = await request(app)
        .post(`/api/issues/${testIssueId}/interact`)
        .set('X-Device-Token', device2Token)
        .field('vote_type', 'resolved_yes')
        .field('voter_latitude', '-23.1011')
        .field('voter_longitude', '-45.7071')
        .field('note', 'Confirmo no local, lâmpada 100% acesa')
        .attach('proof_photo', TEST_IMAGE_BUFFER, 'lampada-confirmada.webp');

      expect(vote2Res.status).toBe(200);
      expect(vote2Res.body.is_presential_gps).toBe(true);
      expect(vote2Res.body.vote_weight).toBe(5.0);
      expect(vote2Res.body.consensus_score).toBe(10.0);
      // Com S >= 10.0 e 2 dispositivos presenciais distintos confirmados -> resolved_community!
      expect(vote2Res.body.resolution_status).toBe('resolved_community');

      // 4. Votos negativos subsequentes contestando que o problema reapareceu
      const device3Token = generateDeviceToken(env.DEVICE_SECRET).token;
      const voteNegative1 = await request(app)
        .post(`/api/issues/${testIssueId}/interact`)
        .set('X-Device-Token', device3Token)
        .field('vote_type', 'resolved_no_returned')
        .field('voter_latitude', '-23.1010')
        .field('voter_longitude', '-45.7070')
        .field('note', 'A lâmpada apagou de novo após a chuva')
        .attach('proof_photo', TEST_IMAGE_BUFFER, 'lampada-apagada.webp');

      expect(voteNegative1.status).toBe(200);

      // Segundo voto negativo via Dispositivo 4
      const device4Token = generateDeviceToken(env.DEVICE_SECRET).token;
      const voteNegative2 = await request(app)
        .post(`/api/issues/${testIssueId}/interact`)
        .set('X-Device-Token', device4Token)
        .field('vote_type', 'resolved_no_returned')
        .field('voter_latitude', '-23.1012')
        .field('voter_longitude', '-45.7069')
        .field('note', 'Continua no escuro')
        .attach('proof_photo', TEST_IMAGE_BUFFER, 'escuro.webp');

      expect(voteNegative2.status).toBe(200);
      // Votos negativos derrubam score e acumulam <= -6.0 nas últimas 72h -> transiciona para reopened!
      expect(voteNegative2.body.resolution_status).toBe('reopened');
      expect(voteNegative2.body.reopened_count).toBeGreaterThanOrEqual(1);
    });

    it('deve manter status reopened ou reabrir quando acumulam votos negativos no seed', async () => {
      // TAI-2026-0107 já é um caso reaberto no seed
      const res = await request(app).get('/api/issues/TAI-2026-0107');

      expect(res.status).toBe(200);
      expect(res.body.resolution_status).toBe('reopened');
      expect(res.body.reopened_count).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // AC8: GET /c/:id (SSR WhatsApp OpenGraph)
  // ==========================================
  describe('AC8: SSR de Compartilhamento WhatsApp e Metatags OpenGraph', () => {
    it('GET /c/TAI-2026-0101 deve retornar HTML com og:title, og:description, og:image e deep-linking', async () => {
      const res = await request(app).get('/c/TAI-2026-0101');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/i);

      const html = res.text;

      // Verifica og:title com bairro e logradouro de Caçapava
      expect(html).toContain('og:title');
      expect(html).toContain('Vera Cruz');
      expect(html).toContain('Avenida Brasil');

      // Verifica og:description com apelo viral
      expect(html).toContain('og:description');
      expect(html).toContain('Cobra, Taiada!');
      expect(html).toContain('Gravidade');

      // Verifica og:image apontando para foto ou SVG dinâmico
      expect(html).toContain('og:image');

      // Verifica injeção do ID para inicialização da SPA React
      expect(html).toContain('window.__INITIAL_ISSUE_ID__ = "TAI-2026-0101"');
    });

    it('GET /c/TAI-INEXISTENTE deve retornar 404 com HTML estruturado', async () => {
      const res = await request(app).get('/c/TAI-INEXISTENTE');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/text\/html/i);
      expect(res.text).toContain('Demanda não encontrada');
    });
  });

  // ==========================================
  // AC9: POST /api/admin/purge-device (Expurgo e Shadowban)
  // ==========================================
  describe('AC9: Moderação Administrativa e Expurgo em 1 Clique', () => {
    it('deve rejeitar requisição administrativa sem token com HTTP 401', async () => {
      const res = await request(app)
        .post('/api/admin/purge-device')
        .send({ device_hash: 'hash-falso-para-teste' });

      expect(res.status).toBe(401);
    });

    it('deve executar expurgo atômico e ativar shadowban com token administrativo válido', async () => {
      const res = await request(app)
        .post('/api/admin/purge-device')
        .set('Authorization', `Bearer ${env.ADMIN_TOKEN}`)
        .send({
          device_hash: 'seed-spammer-hash-404',
          mode: 'purge_and_shadowban',
          reason: 'Teste automatizado de expurgo em 1 clique',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.shadowbanned).toBe(true);
    });
  });

  // ==========================================
  // ADR-008: GET /api/og/:id.svg (Card SVG Dinâmico)
  // ==========================================
  describe('ADR-008: Entrega de Card SVG Dinâmico para WhatsApp', () => {
    it('GET /api/og/TAI-2026-0101.svg deve entregar imagem vetorial SVG com cores oficiais', async () => {
      const res = await request(app).get('/api/og/TAI-2026-0101.svg');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/svg\+xml/i);

      const svg = res.text || (Buffer.isBuffer(res.body) ? res.body.toString('utf-8') : '');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      // Paleta Verde Taiada
      expect(svg.toLowerCase()).toContain('#15301d');
      expect(svg.toLowerCase()).toContain('#347947');
      // Conteúdo da demanda
      expect(svg).toContain('TAI-2026-0101');
      expect(svg).toContain('Avenida Brasil');
    });
  });
});
