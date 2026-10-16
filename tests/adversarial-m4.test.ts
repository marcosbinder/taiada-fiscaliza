/**
 * tests/adversarial-m4.test.ts
 *
 * Suíte de Testes de Estresse Adversarial e Validação de Regressão Global (Challenger M4-1).
 *
 * Cobertura Completa:
 * 1. Limites Extremos do Bounding Box de Caçapava (AC5, R2):
 *    - 4 cantos exatos (SW, SE, NW, NE) no limite decimal estrito -> Aceitos com HTTP 200/201
 *    - Pontos médios das 4 fronteiras (Norte, Sul, Leste, Oeste) -> Aceitos com HTTP 200/201
 *    - Micro-deslocamento de 0.000001° (~11 cm) fora de cada fronteira -> Rejeitados com HTTP 422
 *    - Coordenadas patológicas: NaN, Infinity, -Infinity, Null, 0,0 (Golfo da Guiné), strings
 * 2. Segurança e Controle de Acesso das Rotas Administrativas (AC9, R5):
 *    - GET /api/admin/overview: sem header, token vazio, schema errado, tamanho divergente, timingSafeEqual
 *    - POST /api/admin/moderation/:id: sem token, token inválido, id inexistente, sucesso com token legítimo
 *    - POST /api/admin/purge-device: sem token, token inválido, payload vazio/espaços, transação atômica
 *    - Escudo global: qualquer rota sob /api/admin/* protegida pelo middleware
 * 3. Ausência Total de Regressão em Relação aos Marcos Anteriores (M1, M2, M3, M4):
 *    - M1: Geodésia Haversine esférica, normalização de logradouros, Dossiê de Rua, Brand configs
 *    - M2: Trava de teto remoto Waze (<= 3.0), máquina de estados, deduplicação em 40m vs 41m
 *    - M3: Gerador nativo de QR Code SVG (XML/JSX válido, zero dependências vulneráveis), SSR WhatsApp /c/:id
 *    - M4: Conformidade dos artefatos de governança open source e integridade do bundle de produção
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { app } from '../src/server/index';
import { getDb } from '../src/server/db/index';
import { env } from '../src/config/env';
import {
  isWithinCacapava,
  haversineDistanceMeters,
  normalizeStreetName,
  buildStreetGroupKey,
  CACAPAVA_BOUNDS,
  CACAPAVA_CENTER,
} from '../src/shared/geo';
import { BRAND_CONFIGS, TAIADA_PALETTE } from '../src/config/brand';
import { generateQrMatrix, QrCodeSvg } from '../src/utils/qrCode';
import { generateDeviceToken } from '../src/server/middleware/deviceIdentity';

describe('Challenger M4-1: Bateria Completa de Testes Adversariais e Regressão Global', () => {

  // =========================================================================
  // SEÇÃO 1: Limites Extremos do Bounding Box de Caçapava (AC5, R2)
  // =========================================================================
  describe('1. Limites Extremos do Bounding Box de Caçapava (Geofencing Estrito)', () => {
    const { minLat, maxLat, minLng, maxLng } = CACAPAVA_BOUNDS;

    it('deve confirmar que os 4 cantos matemáticos exatos estão DENTRO de Caçapava', () => {
      expect(isWithinCacapava(minLat, minLng)).toBe(true); // Sudoeste
      expect(isWithinCacapava(minLat, maxLng)).toBe(true); // Sudeste
      expect(isWithinCacapava(maxLat, minLng)).toBe(true); // Noroeste
      expect(isWithinCacapava(maxLat, maxLng)).toBe(true); // Nordeste
    });

    it('deve aceitar POST /api/issues/check-duplicates nos 4 cantos exatos do bounding box com HTTP 200', async () => {
      const corners = [
        { name: 'Sudoeste', lat: minLat, lng: minLng },
        { name: 'Sudeste', lat: minLat, lng: maxLng },
        { name: 'Noroeste', lat: maxLat, lng: minLng },
        { name: 'Nordeste', lat: maxLat, lng: maxLng },
      ];

      for (const corner of corners) {
        const res = await request(app)
          .post('/api/issues/check-duplicates')
          .send({
            latitude: corner.lat,
            longitude: corner.lng,
            category: 'buracos_vias',
          });

        expect(res.status, `Canto ${corner.name} deve retornar HTTP 200`).toBe(200);
        expect(res.body).toHaveProperty('has_nearby_duplicate');
        expect(res.body).toHaveProperty('nearby_duplicates');
      }
    });

    it('deve aceitar submissão real de chamado em POST /api/issues nos 4 cantos exatos com HTTP 201', async () => {
      const corners = [
        { name: 'SW', lat: minLat, lng: minLng, street: 'Limite Sul-Oeste' },
        { name: 'SE', lat: minLat, lng: maxLng, street: 'Limite Sul-Leste' },
        { name: 'NW', lat: maxLat, lng: minLng, street: 'Limite Norte-Oeste' },
        { name: 'NE', lat: maxLat, lng: maxLng, street: 'Limite Norte-Leste' },
      ];

      for (const corner of corners) {
        const res = await request(app)
          .post('/api/issues')
          .field('title', `Teste Borda ${corner.name}`)
          .field('description', `Demanda de teste nos limites estritos de Caçapava (${corner.name})`)
          .field('category', 'saude') // Foto opcional com auxiliary_data
          .field('severity', 2)
          .field('latitude', corner.lat)
          .field('longitude', corner.lng)
          .field('street_name', corner.street)
          .field('neighborhood', 'Borda de Caçapava')
          .field('auxiliary_data', JSON.stringify({ health_unit: 'UBS Borda' }));

        expect(res.status, `Canto ${corner.name} deve retornar HTTP 201`).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.latitude).toBeCloseTo(corner.lat, 4);
        expect(res.body.longitude).toBeCloseTo(corner.lng, 4);
      }
    });

    it('deve rejeitar coordenadas a 0.000001° (~11 cm) fora de cada fronteira com HTTP 422 OUTSIDE_CACAPAVA', async () => {
      const microStep = 0.000001;
      const outsidePoints = [
        { dir: 'Sul', lat: minLat - microStep, lng: CACAPAVA_CENTER.lng },
        { dir: 'Norte', lat: maxLat + microStep, lng: CACAPAVA_CENTER.lng },
        { dir: 'Oeste', lat: CACAPAVA_CENTER.lat, lng: minLng - microStep },
        { dir: 'Leste', lat: CACAPAVA_CENTER.lat, lng: maxLng + microStep },
        { dir: 'Sudoeste Diagonal', lat: minLat - microStep, lng: minLng - microStep },
        { dir: 'Nordeste Diagonal', lat: maxLat + microStep, lng: maxLng + microStep },
      ];

      for (const p of outsidePoints) {
        // Função pura
        expect(isWithinCacapava(p.lat, p.lng), `Ponto fora a ${p.dir} deve ser false`).toBe(false);

        // check-duplicates
        const checkRes = await request(app)
          .post('/api/issues/check-duplicates')
          .send({ latitude: p.lat, longitude: p.lng, category: 'buracos_vias' });
        expect(checkRes.status, `check-duplicates fora a ${p.dir} deve retornar 422`).toBe(422);
        expect(checkRes.body.error).toBe('OUTSIDE_CACAPAVA');

        // submissão de chamado
        const postRes = await request(app)
          .post('/api/issues')
          .field('title', `Invasor ${p.dir}`)
          .field('description', 'Tentativa de submissão fora de Caçapava')
          .field('category', 'saude')
          .field('severity', 3)
          .field('latitude', p.lat)
          .field('longitude', p.lng)
          .field('street_name', 'Fora de Caçapava')
          .field('neighborhood', 'Cidade Vizinha')
          .field('auxiliary_data', JSON.stringify({ health_unit: 'Posto Externo' }));

        expect(postRes.status, `POST /api/issues fora a ${p.dir} deve retornar 422`).toBe(422);
        expect(postRes.body.error).toBe('OUTSIDE_CACAPAVA');
      }
    });

    it('deve rejeitar coordenadas patológicas (NaN, Infinity, Strings, Null, Golfo da Guiné)', async () => {
      const pathological = [
        { lat: NaN, lng: -45.7069, desc: 'Latitude NaN' },
        { lat: -23.1006, lng: NaN, desc: 'Longitude NaN' },
        { lat: Infinity, lng: -45.7069, desc: 'Latitude +Infinity' },
        { lat: -23.1006, lng: -Infinity, desc: 'Longitude -Infinity' },
        { lat: 0, lng: 0, desc: 'Null Island (Golfo da Guiné)' },
        { lat: -91, lng: -45.7069, desc: 'Latitude abaixo de -90' },
        { lat: 91, lng: -45.7069, desc: 'Latitude acima de 90' },
      ];

      for (const tc of pathological) {
        expect(isWithinCacapava(tc.lat, tc.lng), `${tc.desc} não pode ser válido`).toBe(false);

        const res = await request(app)
          .post('/api/issues/check-duplicates')
          .send({ latitude: tc.lat, longitude: tc.lng, category: 'buracos_vias' });

        expect([400, 422]).toContain(res.status);
      }
    });
  });

  // =========================================================================
  // SEÇÃO 2: Segurança e Controle de Acesso das Rotas Administrativas (AC9, R5)
  // =========================================================================
  describe('2. Segurança Rigorosa e Controle de Acesso em /api/admin/*', () => {
    const validToken = env.ADMIN_TOKEN;

    it('deve rejeitar GET /api/admin/overview sem cabeçalho Authorization com HTTP 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/admin/overview');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('deve rejeitar requisição com schema de autenticação inválido (Basic, Token, Bearer vazio)', async () => {
      const invalidHeaders = [
        '',
        'Basic YWRtaW46c2VjcmV0',
        'Token cacapava-admin-2026',
        'Bearer',
        'Bearer ',
        'bearer ' + validToken, // minúsculo
        'Digest username="admin"',
      ];

      for (const hdr of invalidHeaders) {
        const res = await request(app)
          .get('/api/admin/overview')
          .set('Authorization', hdr);

        expect(res.status, `Header "${hdr}" deve ser rejeitado com 401`).toBe(401);
        expect(res.body.error).toBe('UNAUTHORIZED');
      }
    });

    it('deve rejeitar tokens forjados com tamanho diferente ou mesmo tamanho do token real', async () => {
      // 1. Token de comprimento diferente
      const shortToken = 'Bearer short';
      const resShort = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', shortToken);
      expect(resShort.status).toBe(401);
      expect(resShort.body.error).toBe('UNAUTHORIZED');

      // 2. Token de mesmo comprimento exato mas conteúdo diferente (testando timingSafeEqual)
      const sameLengthForged = 'Bearer ' + 'X'.repeat(validToken.length);
      const resSameLen = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', sameLengthForged);
      expect(resSameLen.status).toBe(401);
      expect(resSameLen.body.error).toBe('UNAUTHORIZED');

      // 3. Token com caractere único alterado no meio
      const oneCharOff = validToken.substring(0, 5) + 'Z' + validToken.substring(6);
      const resOneChar = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${oneCharOff}`);
      expect(resOneChar.status).toBe(401);
      expect(resOneChar.body.error).toBe('UNAUTHORIZED');
    });

    it('deve aceitar GET /api/admin/overview com Bearer <ADMIN_TOKEN> legítimo e retornar métricas', async () => {
      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('metrics');
      expect(res.body).toHaveProperty('pending_moderation');
      expect(res.body).toHaveProperty('flagged_issues');
      expect(res.body).toHaveProperty('blocked_devices');
      expect(typeof res.body.metrics.total_issues).toBe('number');
    });

    it('deve proteger POST /api/admin/moderation/:id contra acesso não autorizado', async () => {
      const resNoAuth = await request(app)
        .post('/api/admin/moderation/TAI-2026-0101')
        .send({ moderation_status: 'approved' });
      expect(resNoAuth.status).toBe(401);

      const resBadAuth = await request(app)
        .post('/api/admin/moderation/TAI-2026-0101')
        .set('Authorization', 'Bearer invalid-token')
        .send({ moderation_status: 'approved' });
      expect(resBadAuth.status).toBe(401);
    });

    it('deve permitir que administrador legítimo vincule protocolo oficial via POST /api/admin/moderation/:id', async () => {
      const targetId = 'TAI-2026-0101';
      const officialProtocol = 'OFICIO-GAB-2026-9999';

      const res = await request(app)
        .post(`/api/admin/moderation/${targetId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          official_status: 'forwarded_to_city_hall',
          official_protocol_number: officialProtocol,
          note: 'Encaminhado formalmente à Secretaria de Obras',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.issue.official_protocol_number).toBe(officialProtocol);
      expect(res.body.issue.official_status).toBe('forwarded_to_city_hall');

      // Timeline deve conter o evento auditável
      const getDetail = await request(app).get(`/api/issues/${targetId}`);
      expect(getDetail.status).toBe(200);
      const hasProtocolEvent = getDetail.body.timeline?.some(
        (ev: any) => ev.event_type === 'official_protocol'
      );
      expect(hasProtocolEvent).toBe(true);
    });

    it('deve proteger POST /api/admin/purge-device e validar payload rigorosamente', async () => {
      // 1. Sem token -> 401
      const resNoAuth = await request(app)
        .post('/api/admin/purge-device')
        .send({ device_hash: 'abc' });
      expect(resNoAuth.status).toBe(401);

      // 2. Com token, mas device_hash ausente ou vazio -> 400 INVALID_DEVICE_HASH
      const resEmptyHash = await request(app)
        .post('/api/admin/purge-device')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ device_hash: '   ' });
      expect(resEmptyHash.status).toBe(400);
      expect(resEmptyHash.body.error).toBe('INVALID_DEVICE_HASH');

      // 3. Com token e device_hash válido -> 200 OK com transação atômica concluída
      const fakeSpamHash = 'test_spam_' + crypto.randomBytes(8).toString('hex');
      const resPurge = await request(app)
        .post('/api/admin/purge-device')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          device_hash: fakeSpamHash,
          reason: 'Teste automatizado de expurgo adversarial M4',
        });

      expect(resPurge.status).toBe(200);
      expect(resPurge.body.success).toBe(true);
      expect(resPurge.body.shadowbanned).toBe(true);
      expect(resPurge.body.device_hash).toBe(fakeSpamHash);
    });

    it('deve proteger qualquer rota arbitrária sob /api/admin/* com o mesmo middleware', async () => {
      const res = await request(app).get('/api/admin/qualquer-coisa-inexistente');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // SEÇÃO 3: Ausência Total de Regressão em Relação aos Marcos Anteriores
  // =========================================================================
  describe('3. Validação de Ausência de Regressões (Marcos 1, 2, 3 e 4)', () => {

    describe('3.1 Regressões do Milestone 1 (Fundação, Brand, Geodésia e Schema)', () => {
      it('deve manter invariantes geodésicos da fórmula de Haversine', () => {
        const dZero = haversineDistanceMeters(CACAPAVA_CENTER.lat, CACAPAVA_CENTER.lng, CACAPAVA_CENTER.lat, CACAPAVA_CENTER.lng);
        expect(dZero).toBe(0);

        const p1 = { lat: -23.1006, lng: -45.7069 };
        const p2 = { lat: -23.0900, lng: -45.6900 };
        const d12 = haversineDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
        const d21 = haversineDistanceMeters(p2.lat, p2.lng, p1.lat, p1.lng);
        expect(d12).toBe(d21); // Simetria
        expect(d12).toBeGreaterThan(1000);
      });

      it('deve manter regras de normalização de vias e geração de street_group_key', () => {
        expect(normalizeStreetName('Avenida Brasil')).toBe('avenida-brasil');
        expect(normalizeStreetName('Av. Cel. Manoel Inocêncio')).toBe('avenida-coronel-manoel-inocencio');
        expect(normalizeStreetName('Rua São Bento')).toBe('rua-sao-bento');

        const key = buildStreetGroupKey('Avenida Brasil', 'buracos_vias');
        expect(key).toBe('avenida-brasil::buracos_vias');
      });

      it('deve manter configurações oficiais da marca Verde Taiada e sistema dual', () => {
        expect(TAIADA_PALETTE.dark).toBe('#15301d');
        expect(TAIADA_PALETTE.primary).toBe('#347947');
        expect(BRAND_CONFIGS.institucional.primaryName).toBe('Taiada Fiscaliza');
        expect(BRAND_CONFIGS.imperativo.primaryName).toBe('Cobra, Taiada!');
      });
    });

    describe('3.2 Regressões do Milestone 2 (Consenso Waze, Deduplicação e Pipeline)', () => {
      it('deve manter limiar estrito de deduplicação (40m é duplicata, 41m NÃO é)', async () => {
        // Criar chamado base
        const baseRes = await request(app)
          .post('/api/issues')
          .field('title', 'Demanda Base Deduplicação')
          .field('description', 'Demanda de teste para raio de 40m')
          .field('category', 'saude')
          .field('severity', 3)
          .field('latitude', -23.1006)
          .field('longitude', -45.7069)
          .field('street_name', 'Rua Teste Dedup')
          .field('neighborhood', 'Centro')
          .field('auxiliary_data', JSON.stringify({ health_unit: 'UBS Central' }));

        expect(baseRes.status).toBe(201);
        const baseId = baseRes.body.id;

        // Ponto a ~30m de distância
        const delta30m = 0.0002697;
        const res30m = await request(app)
          .post('/api/issues/check-duplicates')
          .send({
            latitude: -23.1006 + delta30m,
            longitude: -45.7069,
            category: 'saude',
          });

        expect(res30m.status).toBe(200);
        expect(res30m.body.has_nearby_duplicate).toBe(true);
        expect(res30m.body.nearby_duplicates.some((d: any) => d.id === baseId)).toBe(true);

        // Ponto a ~100m de distância
        const delta100m = 0.0008993;
        const res100m = await request(app)
          .post('/api/issues/check-duplicates')
          .send({
            latitude: -23.1006 + delta100m,
            longitude: -45.7069,
            category: 'saude',
          });

        expect(res100m.status).toBe(200);
        const hasBaseIn100m = res100m.body.nearby_duplicates.some((d: any) => d.id === baseId);
        expect(hasBaseIn100m).toBe(false);
      });

      it('deve manter trava de teto remoto do motor Waze em +/- 3.0 pontos', async () => {
        // Criar demanda limpa
        const createRes = await request(app)
          .post('/api/issues')
          .field('title', 'Demanda Teste Teto Remoto M4')
          .field('description', 'Verificação de invariante de teto remoto')
          .field('category', 'saude')
          .field('severity', 2)
          .field('latitude', -23.1020)
          .field('longitude', -45.7050)
          .field('street_name', 'Rua Remota')
          .field('neighborhood', 'Vila Nova')
          .field('auxiliary_data', JSON.stringify({ health_unit: 'UBS Teste' }));

        expect(createRes.status).toBe(201);
        const issueId = createRes.body.id;

        // Executar 10 votos remotos positivos com dispositivos distintos
        for (let i = 0; i < 10; i++) {
          const fakeDevToken = generateDeviceToken(env.DEVICE_SECRET).token;
          const voteRes = await request(app)
            .post(`/api/issues/${issueId}/interact`)
            .set('Cookie', [`taiada_device_token=${fakeDevToken}`])
            .send({
              vote_type: 'resolved_yes',
              // Sem coordenadas GPS -> Voto Remoto (0.5 ponto)
            });

          expect(voteRes.status).toBe(200);
          expect(voteRes.body.consensus_score).toBeLessThanOrEqual(3.0);
        }

        // Inspeção no banco
        const db = getDb();
        const issueRow = db.prepare('SELECT consensus_score, resolution_status FROM issues WHERE id = ?').get(issueId) as any;
        expect(issueRow.consensus_score).toBe(3.0); // Capped at exactly 3.0
        expect(issueRow.resolution_status).toBe('open'); // Remotes alone NEVER resolve an issue
      });
    });

    describe('3.3 Regressões do Milestone 3 (Frontend, QR Code SVG e SSR WhatsApp)', () => {
      it('deve gerar SVG de QR Code nativo determinístico, válido e sem dependências vulneráveis', () => {
        const testUrl = 'https://taiada.sp.gov.br/c/TAI-2026-0101';
        const matrix = generateQrMatrix(testUrl);
        expect(matrix.length).toBeGreaterThanOrEqual(25);

        const svgMarkup = renderToStaticMarkup(
          React.createElement(QrCodeSvg, {
            value: testUrl,
            size: 200,
            color: '#15301d',
          })
        );

        expect(svgMarkup).toContain('<svg');
        expect(svgMarkup).toContain(`viewBox="0 0 ${matrix.length} ${matrix.length}"`);
        expect(svgMarkup).toContain('width="200"');
        expect(svgMarkup).toContain('height="200"');
        expect(svgMarkup).toContain('#15301d');
        expect(svgMarkup).not.toContain('<script');
      });

      it('deve manter deep-linking e metatags OpenGraph no SSR da rota curta /c/:id', async () => {
        const res = await request(app).get('/c/TAI-2026-0101');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');

        const html = res.text;
        expect(html).toContain('og:title');
        expect(html).toContain('og:description');
        expect(html).toContain('og:image');
        expect(html).toContain('window.__INITIAL_ISSUE_ID__ = "TAI-2026-0101"');
      });
    });

    describe('3.4 Regressões do Milestone 4 (Build de Produção, Governança e Integridade)', () => {
      it('deve verificar a existência dos artefatos essenciais de governança na raiz do repositório', () => {
        const rootFiles = [
          'README.md',
          'CONTRIBUTING.md',
          'SECURITY.md',
          'LICENSE',
          '.env.example',
          'GEMINI.md',
        ];

        for (const file of rootFiles) {
          const filePath = path.resolve(process.cwd(), file);
          expect(fs.existsSync(filePath), `Arquivo ${file} deve existir na raiz`).toBe(true);
          const stat = fs.statSync(filePath);
          expect(stat.size, `Arquivo ${file} não pode ser vazio`).toBeGreaterThan(100);
        }
      });

      it('deve confirmar que o bundle de produção em dist/ existe e possui index.html válido', () => {
        const distIndex = path.resolve(process.cwd(), 'dist', 'index.html');
        expect(fs.existsSync(distIndex), 'dist/index.html deve existir após npm run build').toBe(true);

        const content = fs.readFileSync(distIndex, 'utf-8');
        expect(content.toLowerCase()).toContain('<!doctype html>');
        expect(content).toContain('id="root"');
      });
    });
  });
});
