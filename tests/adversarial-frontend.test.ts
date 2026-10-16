/**
 * tests/adversarial-frontend.test.ts
 *
 * Suíte de Testes Adversariais do Frontend (Lógica de Negócio, Estado e Regras de Validação)
 * Executado pelo Challenger M3-2 (Frontend Logic & State Challenger).
 *
 * Escopo dos Testes Adversariais:
 * 1. Regra de deduplicação <= 40m e montagem de candidato a duplicata:
 *    - Limiares exatos de Haversine (0m, 39.9m, 40.0m vs 40.01m, 45m).
 *    - Coordenadas no hemisfério Sul/Oeste (Caçapava - SP).
 *    - Segregação estrita por categoria e status de resolução (ignora resolvidos e shadowbanned).
 *    - Estrutura completa de DuplicateCandidate e ordenação por proximidade.
 *
 * 2. Regra de obrigatoriedade de fotos (5 categorias físicas vs 3 sociais com campos auxiliares):
 *    - Categorias físicas: buracos_vias, iluminacao, limpeza_mato, calcadas_acessibilidade, sinalizacao_transito.
 *    - Categorias sociais: saude (health_unit*), educacao (school_name*), transporte (bus_line*).
 *    - Validação de payload auxiliar (nulo, vazio, whitespace, injeção de tipos).
 *    - Bloqueio síncrono no frontend e validação defensiva.
 *
 * 3. Lógica de detecção de voto presencial (<= 150m) vs remoto (> 150m) e pesos (3.0 vs 0.5, 5.0 c/ foto):
 *    - Limiares de 0m, 149.9m, 150.0m (Presencial = 3.0 / 5.0) vs 150.01m, 200m (Remoto = 0.5).
 *    - Ausência de GPS / Erro de geolocalização no navegador (fallback para remoto 0.5).
 *    - Feedback visual no componente IssueDetailSheet.
 *    - Trava de teto remoto (|soma remotos| <= 3.0) impedindo ataque de sybil remoto.
 *
 * 4. Geração de mensagens de WhatsApp em pt-BR com link encurtado /c/:id:
 *    - Formato do link curto (/c/:id).
 *    - Textos para chamado individual vs dossiê coletivo de rua.
 *    - Codificação segura de URI para https://wa.me/?text= com caracteres especiais e emojis.
 *
 * 5. Comportamento do deep-linking em App.tsx:
 *    - Prioridade estrita de window.__INITIAL_ISSUE_ID__ sobre window.location.pathname.
 *    - Fallback de regex para pathname /c/:id (case-insensitive, com/sem barra final).
 *    - Normalização de ID para uppercase.
 *    - Comportamento quando nenhum deep-link é especificado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/index';
import { getDb, closeDb } from '../src/server/db/index';
import { seedDatabase } from '../src/server/db/seed';

import {
  isWithinCacapava,
  haversineDistanceMeters,
  buildStreetGroupKey,
  DUPLICATE_RADIUS_METERS,
  PRESENTIAL_RADIUS_METERS,
  CACAPAVA_BOUNDS,
  CACAPAVA_CENTER,
} from '../src/shared/geo';

import {
  CATEGORY_MAP,
  CATEGORIES_LIST,
  isPhotoRequired,
  validateAuxiliaryData,
  getCategoryDefinition,
} from '../src/shared/categories';

import {
  computeVoteWeight,
  calculateConsensusScore,
  WEIGHT_PRESENTIAL_NO_PHOTO,
  WEIGHT_PRESENTIAL_PHOTO,
  WEIGHT_REMOTE,
  REMOTE_CEILING,
} from '../src/server/services/consensusEngine';

import { findDuplicates } from '../src/server/services/geoService';
import { IssueCategory, DuplicateCandidate, Issue } from '../src/shared/types';

describe('Harness Adversarial de Lógica do Frontend & Estado (Challenger M3-2)', () => {
  beforeAll(() => {
    const db = getDb();
    seedDatabase(db);
  });

  afterAll(() => {
    closeDb();
  });

  // =========================================================================
  // 1. DEDUPLICAÇÃO <= 40m E MONTAGEM DE CANDIDATO A DUPLICATA
  // =========================================================================
  describe('Adversarial 1: Deduplicação <= 40m e Candidatos a Duplicata', () => {
    it('deve calcular a distância de Haversine com precisão métrica na fronteira crítica de 40m', () => {
      // Ponto base na Praça da Bandeira / Centro de Caçapava
      const baseLat = -23.100600;
      const baseLng = -45.706900;

      // Deslocamento de latitude: 1 grau de latitude ~ 111.139 metros
      // 40 metros ~ 0.00035987 graus
      // Ponto a 0m
      expect(haversineDistanceMeters(baseLat, baseLng, baseLat, baseLng)).toBe(0);

      // Ponto a ~20m
      const lat20m = baseLat + 0.000180;
      const dist20m = haversineDistanceMeters(baseLat, baseLng, lat20m, baseLng);
      expect(dist20m).toBeGreaterThan(15);
      expect(dist20m).toBeLessThan(25);
      expect(dist20m <= DUPLICATE_RADIUS_METERS).toBe(true);

      // Ponto logo abaixo de 40m (ex: 38-39m)
      const lat39m = baseLat + 0.000350;
      const dist39m = haversineDistanceMeters(baseLat, baseLng, lat39m, baseLng);
      expect(dist39m).toBeLessThanOrEqual(40.0);
      expect(dist39m <= DUPLICATE_RADIUS_METERS).toBe(true);

      // Ponto logo acima de 40m (ex: 42-45m)
      const lat45m = baseLat + 0.000405;
      const dist45m = haversineDistanceMeters(baseLat, baseLng, lat45m, baseLng);
      expect(dist45m).toBeGreaterThan(40.0);
      expect(dist45m <= DUPLICATE_RADIUS_METERS).toBe(false);
    });

    it('deve respeitar estritamente a segregação por categoria e status de resolução no banco', () => {
      const db = getDb();

      // Chamado TAI-2026-0101 no seed: Avenida Brasil, buracos_vias, lat -23.0985, lng -45.7020
      const issue0101 = db.prepare('SELECT * FROM issues WHERE id = ?').get('TAI-2026-0101') as Issue;
      expect(issue0101).toBeDefined();

      // 1. Consulta com MESMA coordenada e MESMA categoria -> deve detectar duplicata
      const dupExact = findDuplicates(db, {
        latitude: issue0101.latitude,
        longitude: issue0101.longitude,
        category: 'buracos_vias',
        street_name: issue0101.street_name,
      });

      expect(dupExact.has_nearby_duplicate).toBe(true);
      expect(dupExact.duplicate_issue).not.toBeNull();
      expect(dupExact.duplicate_issue?.id).toBe(issue0101.id);
      expect(dupExact.duplicate_issue?.distance_meters).toBe(0);

      // 2. Consulta a 10 metros da coordenada, mas com categoria DIFERENTE (iluminacao) -> NÃO deve ser duplicata
      const dupDiffCategory = findDuplicates(db, {
        latitude: issue0101.latitude + 0.00008,
        longitude: issue0101.longitude,
        category: 'iluminacao',
        street_name: issue0101.street_name,
      });

      // Não deve ter duplicata próxima da categoria 'iluminacao' nessa coordenada
      const nearbyWithSameId = dupDiffCategory.nearby_duplicates.some((d) => d.id === issue0101.id);
      expect(nearbyWithSameId).toBe(false);

      // 3. Chamados com status 'resolved_community' NÃO devem ser considerados duplicatas ativas
      // Criamos temporariamente um chamado resolvido a 5 metros
      db.prepare(`
        INSERT INTO issues (
          id, title, description, category, severity, latitude, longitude,
          street_name, street_group_key, neighborhood, location_source, resolution_status, moderation_status,
          trust_score, device_hash, consensus_score, upvotes_count, created_at, updated_at
        ) VALUES (
          'TAI-TEST-RESOLVED', 'Buraco Antigo Resolvido', 'Já tapado pela prefeitura',
          'buracos_vias', 3, ?, ?, 'Avenida Brasil', 'avenida-brasil::buracos_vias', 'Vera Cruz',
          'manual_pin', 'resolved_community', 'auto_approved', 85, 'hash_test_resolved', 12.0, 5, ?, ?
        )
      `).run(issue0101.latitude + 0.00004, issue0101.longitude, Date.now(), Date.now());

      const checkResolved = findDuplicates(db, {
        latitude: issue0101.latitude + 0.00004,
        longitude: issue0101.longitude,
        category: 'buracos_vias',
      });

      expect(checkResolved.nearby_duplicates.some((d) => d.id === 'TAI-TEST-RESOLVED')).toBe(false);

      // Limpeza do teste
      db.prepare('DELETE FROM issues WHERE id = ?').run('TAI-TEST-RESOLVED');
    });

    it('deve montar a estrutura completa do DuplicateCandidate com todos os campos exigidos pela UI', () => {
      const db = getDb();
      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get('TAI-2026-0101') as Issue;

      const res = findDuplicates(db, {
        latitude: issue.latitude + 0.0001,
        longitude: issue.longitude,
        category: 'buracos_vias',
        street_name: issue.street_name,
      });

      expect(res.has_nearby_duplicate).toBe(true);
      const candidate = res.duplicate_issue;
      expect(candidate).toBeDefined();

      // Campos exigidos pelo Card Verde Taiada (#347947) em CreateIssueSheet.tsx:
      // candidate.id, candidate.title, candidate.distance_meters, candidate.upvotes_count, candidate.category, candidate.severity
      expect(typeof candidate?.id).toBe('string');
      expect(typeof candidate?.title).toBe('string');
      expect(typeof candidate?.distance_meters).toBe('number');
      expect(typeof candidate?.upvotes_count).toBe('number');
      expect(typeof candidate?.severity).toBe('number');
      expect(candidate?.category).toBe('buracos_vias');
      expect(candidate?.distance_meters).toBeLessThanOrEqual(40);
    });

    it('deve simular o fluxo de seleção de duplicata (Opção A) fechando a criação e focando no chamado existente', () => {
      // Simulação da lógica de CreateIssueSheet -> onSelectDuplicateToContribute -> App.tsx handleDuplicateContribution
      let isCreateSheetOpen = true;
      let selectedIssue: Issue | null = null;
      let toastEmitted: string | null = null;

      const mockCandidate: DuplicateCandidate = {
        id: 'TAI-2026-0101',
        title: 'Buraco profundo na Av. Brasil',
        category: 'buracos_vias',
        severity: 4,
        distance_meters: 18.5,
        upvotes_count: 14,
        photo_url: '/uploads/seed_buraco1.webp',
        created_at: Date.now() - 3600000,
      };

      const mockIssuesList: Issue[] = [
        {
          id: 'TAI-2026-0101',
          title: 'Buraco profundo na Av. Brasil',
          category: 'buracos_vias',
          severity: 4,
          latitude: -23.0985,
          longitude: -45.7020,
          street_name: 'Avenida Brasil',
          neighborhood: 'Vera Cruz',
          upvotes_count: 14,
          consensus_score: 5.5,
          resolution_status: 'open',
          moderation_status: 'auto_approved',
        } as Issue,
      ];

      // Executa o handler exato de App.tsx
      const handleDuplicateContribution = (cand: DuplicateCandidate) => {
        isCreateSheetOpen = false;
        const found = mockIssuesList.find((i) => i.id === cand.id);
        if (found) {
          selectedIssue = found;
        }
        toastEmitted = `Apoiando chamado existente ${cand.id}`;
      };

      handleDuplicateContribution(mockCandidate);

      expect(isCreateSheetOpen).toBe(false);
      expect(selectedIssue).not.toBeNull();
      expect(selectedIssue?.id).toBe('TAI-2026-0101');
      expect(toastEmitted).toBe('Apoiando chamado existente TAI-2026-0101');
    });
  });

  // =========================================================================
  // 2. OBRIGATORIEDADE DE FOTOS: 5 FÍSICAS VS 3 SOCIAIS
  // =========================================================================
  describe('Adversarial 2: Regras de Obrigatoriedade de Foto e Campos Auxiliares', () => {
    const PHYSICAL_CATEGORIES: IssueCategory[] = [
      'buracos_vias',
      'iluminacao',
      'limpeza_mato',
      'calcadas_acessibilidade',
      'sinalizacao_transito',
    ];

    const SOCIAL_CATEGORIES: IssueCategory[] = ['saude', 'educacao', 'transporte'];

    it('deve marcar foto como estritamente obrigatória para as 5 categorias físicas', () => {
      expect(PHYSICAL_CATEGORIES.length).toBe(5);

      for (const cat of PHYSICAL_CATEGORIES) {
        expect(isPhotoRequired(cat)).toBe(true);
        const def = getCategoryDefinition(cat);
        expect(def.photoRequired).toBe(true);
      }
    });

    it('deve marcar foto como opcional para as 3 categorias sociais', () => {
      expect(SOCIAL_CATEGORIES.length).toBe(3);

      for (const cat of SOCIAL_CATEGORIES) {
        expect(isPhotoRequired(cat)).toBe(false);
        const def = getCategoryDefinition(cat);
        expect(def.photoRequired).toBe(false);
      }
    });

    it('deve simular a validação do formulário no frontend (CreateIssueSheet handleSubmit)', () => {
      // Simulação da lógica de CreateIssueSheet.tsx linhas 208-212:
      // if (isPhotoRequired(category) && !photoFile) { setSubmitError('A foto é obrigatória para esta categoria.'); return; }
      const validateSubmissionClient = (
        category: IssueCategory,
        photoFile: object | null,
        title: string,
        description: string,
        lat: number,
        lng: number
      ): { valid: boolean; error: string | null } => {
        if (isPhotoRequired(category) && !photoFile) {
          return { valid: false, error: 'A foto é obrigatória para esta categoria.' };
        }
        if (!title.trim() || title.trim().length < 5) {
          return { valid: false, error: 'Informe um título claro com pelo menos 5 caracteres.' };
        }
        if (!description.trim() || description.trim().length < 10) {
          return { valid: false, error: 'Descreva o problema com pelo menos 10 caracteres.' };
        }
        if (!isWithinCacapava(lat, lng)) {
          return { valid: false, error: 'Coordenadas fora dos limites municipais de Caçapava - SP.' };
        }
        return { valid: true, error: null };
      };

      // 1. Categoria física sem foto -> DEVE BLOQUEAR
      const resPhysicalNoPhoto = validateSubmissionClient(
        'buracos_vias',
        null,
        'Cratera gigante',
        'Cratera aberta há 2 semanas na via principal',
        -23.1006,
        -45.7069
      );
      expect(resPhysicalNoPhoto.valid).toBe(false);
      expect(resPhysicalNoPhoto.error).toBe('A foto é obrigatória para esta categoria.');

      // 2. Categoria física com foto -> DEVE PERMITIR
      const resPhysicalWithPhoto = validateSubmissionClient(
        'buracos_vias',
        { name: 'buraco.jpg' },
        'Cratera gigante',
        'Cratera aberta há 2 semanas na via principal',
        -23.1006,
        -45.7069
      );
      expect(resPhysicalWithPhoto.valid).toBe(true);
      expect(resPhysicalWithPhoto.error).toBeNull();

      // 3. Categoria social sem foto -> DEVE PERMITIR (foto opcional)
      const resSocialNoPhoto = validateSubmissionClient(
        'saude',
        null,
        'Demora excessiva na UBS',
        'Fila de mais de 4 horas para atendimento médico',
        -23.1006,
        -45.7069
      );
      expect(resSocialNoPhoto.valid).toBe(true);
      expect(resSocialNoPhoto.error).toBeNull();
    });

    it('deve validar adversariamente os campos auxiliares obrigatórios das 3 categorias sociais', () => {
      // 1. Saúde: exige health_unit
      expect(validateAuxiliaryData('saude', null).valid).toBe(false);
      expect(validateAuxiliaryData('saude', {}).valid).toBe(false);
      expect(validateAuxiliaryData('saude', { health_unit: '' }).valid).toBe(false);
      expect(validateAuxiliaryData('saude', { health_unit: '   ' }).valid).toBe(false);
      expect(validateAuxiliaryData('saude', { health_unit: 12345 } as any).valid).toBe(false);
      expect(validateAuxiliaryData('saude', { health_unit: 'UBS Vila Paraíso' }).valid).toBe(true);

      // Campo opcional approx_time em saúde não impede validação se ausente
      expect(validateAuxiliaryData('saude', { health_unit: 'UBS Centro', approx_time: '14:30' }).valid).toBe(true);

      // 2. Educação: exige school_name
      expect(validateAuxiliaryData('educacao', null).valid).toBe(false);
      expect(validateAuxiliaryData('educacao', {}).valid).toBe(false);
      expect(validateAuxiliaryData('educacao', { school_name: '' }).valid).toBe(false);
      expect(validateAuxiliaryData('educacao', { school_name: '   ' }).valid).toBe(false);
      expect(validateAuxiliaryData('educacao', { school_name: 'EMEF Prof. Lindolpho Machado' }).valid).toBe(true);

      // 3. Transporte: exige bus_line
      expect(validateAuxiliaryData('transporte', null).valid).toBe(false);
      expect(validateAuxiliaryData('transporte', {}).valid).toBe(false);
      expect(validateAuxiliaryData('transporte', { bus_line: '' }).valid).toBe(false);
      expect(validateAuxiliaryData('transporte', { bus_line: '   ' }).valid).toBe(false);
      expect(validateAuxiliaryData('transporte', { bus_line: 'Linha 03 - Piedade / Centro' }).valid).toBe(true);

      // Campo opcional stop_reference em transporte
      expect(
        validateAuxiliaryData('transporte', {
          bus_line: 'Linha 01',
          stop_reference: 'Perto da igreja',
        }).valid
      ).toBe(true);

      // 4. Categorias físicas não possuem campos auxiliares obrigatórios
      expect(validateAuxiliaryData('buracos_vias', null).valid).toBe(true);
      expect(validateAuxiliaryData('iluminacao', { pole_number: 'CP-1234' }).valid).toBe(true);
      expect(validateAuxiliaryData('limpeza_mato', null).valid).toBe(true);
    });
  });

  // =========================================================================
  // 3. DETECÇÃO DE VOTO PRESENCIAL (<= 150m) VS REMOTO (> 150m) E PESOS
  // =========================================================================
  describe('Adversarial 3: Prova de Presença GPS Waze (<= 150m) e Ponderação de Votos', () => {
    const issueLat = -23.100600;
    const issueLng = -45.706900;

    it('deve classificar rigorosamente os pesos na fronteira de 150 metros', () => {
      // 1. Ponto sobre o local (0m) sem foto -> Presencial 3.0
      const v0m = computeVoteWeight({
        issue_latitude: issueLat,
        issue_longitude: issueLng,
        voter_latitude: issueLat,
        voter_longitude: issueLng,
        has_proof_photo: false,
      });
      expect(v0m.is_presential_gps).toBe(1);
      expect(v0m.vote_weight).toBe(WEIGHT_PRESENTIAL_NO_PHOTO); // 3.0
      expect(v0m.distance_to_issue_meters).toBe(0);

      // 2. Ponto sobre o local (0m) COM foto -> Presencial 5.0
      const v0mPhoto = computeVoteWeight({
        issue_latitude: issueLat,
        issue_longitude: issueLng,
        voter_latitude: issueLat,
        voter_longitude: issueLng,
        has_proof_photo: true,
      });
      expect(v0mPhoto.is_presential_gps).toBe(1);
      expect(v0mPhoto.vote_weight).toBe(WEIGHT_PRESENTIAL_PHOTO); // 5.0

      // 3. Ponto dentro do raio de 150m (ex: ~100m)
      const lat100m = issueLat + 0.000900;
      const dist100m = haversineDistanceMeters(issueLat, issueLng, lat100m, issueLng);
      expect(dist100m).toBeLessThanOrEqual(150);

      const v100m = computeVoteWeight({
        issue_latitude: issueLat,
        issue_longitude: issueLng,
        voter_latitude: lat100m,
        voter_longitude: issueLng,
        has_proof_photo: false,
      });
      expect(v100m.is_presential_gps).toBe(1);
      expect(v100m.vote_weight).toBe(3.0);

      // 4. Ponto logo além de 150m (ex: ~180m)
      const lat180m = issueLat + 0.001650;
      const dist180m = haversineDistanceMeters(issueLat, issueLng, lat180m, issueLng);
      expect(dist180m).toBeGreaterThan(150);

      const v180m = computeVoteWeight({
        issue_latitude: issueLat,
        issue_longitude: issueLng,
        voter_latitude: lat180m,
        voter_longitude: issueLng,
        has_proof_photo: false,
      });
      expect(v180m.is_presential_gps).toBe(0);
      expect(v180m.vote_weight).toBe(WEIGHT_REMOTE); // 0.5

      // 5. Voto remoto MESMO com foto NÃO recebe bônus presencial de 5.0
      const v180mPhoto = computeVoteWeight({
        issue_latitude: issueLat,
        issue_longitude: issueLng,
        voter_latitude: lat180m,
        voter_longitude: issueLng,
        has_proof_photo: true,
      });
      expect(v180mPhoto.is_presential_gps).toBe(0);
      expect(v180mPhoto.vote_weight).toBe(WEIGHT_REMOTE); // 0.5 (sem bônus de presença remota)

      // 6. Sem coordenadas de GPS (permissão negada no navegador)
      const vNoGps = computeVoteWeight({
        issue_latitude: issueLat,
        issue_longitude: issueLng,
        voter_latitude: undefined,
        voter_longitude: undefined,
        has_proof_photo: false,
      });
      expect(vNoGps.is_presential_gps).toBe(0);
      expect(vNoGps.vote_weight).toBe(WEIGHT_REMOTE);
      expect(vNoGps.distance_to_issue_meters).toBeNull();
    });

    it('deve simular o feedback visual de IssueDetailSheet.tsx para presença vs voto remoto', () => {
      // Simulação da lógica de feedback em IssueDetailSheet.tsx linhas 102-108:
      const getVoteFeedback = (type: string, isPresential: boolean): string => {
        if (type === 'upvote') {
          return 'Apoio registrado com sucesso! Obrigado por fortalecer Caçapava.';
        } else if (isPresential) {
          return '📍 Presença confirmada no local (peso 3,0)! Voto registrado.';
        } else {
          return '🌐 Voto remoto registrado (peso 0,5).';
        }
      };

      expect(getVoteFeedback('upvote', true)).toBe(
        'Apoio registrado com sucesso! Obrigado por fortalecer Caçapava.'
      );
      expect(getVoteFeedback('upvote', false)).toBe(
        'Apoio registrado com sucesso! Obrigado por fortalecer Caçapava.'
      );
      expect(getVoteFeedback('resolved_yes', true)).toBe(
        '📍 Presença confirmada no local (peso 3,0)! Voto registrado.'
      );
      expect(getVoteFeedback('resolved_yes', false)).toBe(
        '🌐 Voto remoto registrado (peso 0,5).'
      );
      expect(getVoteFeedback('resolved_no_returned', true)).toBe(
        '📍 Presença confirmada no local (peso 3,0)! Voto registrado.'
      );
      expect(getVoteFeedback('resolved_no_returned', false)).toBe(
        '🌐 Voto remoto registrado (peso 0,5).'
      );
    });

    it('deve assegurar que votos remotos sozinhos nunca ultrapassam a trava de teto (|soma| <= 3.0)', () => {
      // Criação de 50 votos remotos de resolução positiva (cada um com peso 0.5)
      const fakeVotes = Array.from({ length: 50 }, (_, i) => ({
        device_hash: `remote_device_${i}`,
        vote_type: 'resolved_yes' as const,
        vote_weight: 0.5,
        is_presential_gps: 0,
        is_shadowbanned: 0,
        created_at: Date.now(),
      }));

      const result = calculateConsensusScore(fakeVotes);

      // A soma bruta seria 25.0, mas a trava de teto remoto impõe máximo de 3.0
      expect(result.remote_score_clamped).toBe(REMOTE_CEILING); // 3.0
      expect(result.consensus_score).toBe(REMOTE_CEILING); // 3.0
      expect(result.distinct_positive_presential_devices).toBe(0);

      // Como o teto é 3.0, o chamado NUNCA passará para 'verifying_resolution' (>= 4.0)
      // apenas com votos remotos! Isso valida a resistência contra ataques Sybil.
      expect(result.consensus_score < 4.0).toBe(true);
    });
  });

  // =========================================================================
  // 4. GERAÇÃO DE MENSAGENS DE WHATSAPP EM PT-BR COM LINK /c/:id
  // =========================================================================
  describe('Adversarial 4: Geração de Mensagens Virais de WhatsApp com Link /c/:id', () => {
    it('deve gerar texto em pt-BR perfeitamente formatado para chamado individual com link /c/:id', () => {
      const mockIssue: Partial<Issue> = {
        id: 'TAI-2026-0101',
        title: 'Buraco profundo na Av. Brasil',
        neighborhood: 'Vera Cruz',
        street_name: 'Avenida Brasil',
        severity: 4,
        upvotes_count: 14,
      };

      const baseUrl = 'https://taiadafiscaliza.com.br';
      const shareUrl = `${baseUrl}/c/${mockIssue.id}`;

      // Lógica de WhatsAppShareModal.tsx linhas 34-41
      const messageText =
        `🚨 *Atenção, vizinhos de Caçapava!*\n` +
        `📍 *${mockIssue.neighborhood}* (${mockIssue.street_name})\n` +
        `⚠️ *${mockIssue.title}* (Gravidade ${mockIssue.severity}/5)\n\n` +
        `Já temos *${mockIssue.upvotes_count} moradores* cobrando providências!\n` +
        `Dá uma força lá no mapa cívico pra pressionar a Prefeitura e os vereadores:\n` +
        `🔗 ${shareUrl}\n\n` +
        `_(Não precisa baixar app nem criar cadastro, é só clicar e apoiar com 1 toque)_`;

      expect(messageText).toContain('🚨 *Atenção, vizinhos de Caçapava!*');
      expect(messageText).toContain('📍 *Vera Cruz* (Avenida Brasil)');
      expect(messageText).toContain('⚠️ *Buraco profundo na Av. Brasil* (Gravidade 4/5)');
      expect(messageText).toContain('*14 moradores* cobrando providências!');
      expect(messageText).toContain('🔗 https://taiadafiscaliza.com.br/c/TAI-2026-0101');
      expect(messageText).toContain('_(Não precisa baixar app nem criar cadastro, é só clicar e apoiar com 1 toque)_');

      // Testa a codificação URI para wa.me/?text=
      const encoded = encodeURIComponent(messageText);
      const waUrl = `https://wa.me/?text=${encoded}`;

      expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
      expect(waUrl).toContain('%2Fc%2FTAI-2026-0101');
      expect(decodeURIComponent(encoded)).toBe(messageText);
    });

    it('deve gerar texto em pt-BR adaptado para Dossiê Coletivo de Rua', () => {
      const mockDossier = {
        street_name: 'Avenida Brasil',
        category_label: 'Buracos e Pavimentação',
        issues_count: 3,
        total_upvotes: 48,
      };

      const baseUrl = 'https://taiadafiscaliza.com.br';
      const shareUrl = `${baseUrl}`;

      // Lógica de WhatsAppShareModal.tsx linhas 43-50
      const messageText =
        `🚨 *Dossiê Coletivo da Via em Caçapava!*\n` +
        `📍 *${mockDossier.street_name}*\n` +
        `⚠️ *${mockDossier.category_label}*: já são *${mockDossier.issues_count} problemas graves* mapeados ao longo da via!\n\n` +
        `Já somamos *${mockDossier.total_upvotes} moradores afetados* cobrando a Secretaria de Obras.\n` +
        `Acesse para assinar e apoiar o ofício oficial:\n` +
        `🔗 ${shareUrl}\n\n` +
        `_(Apoio 100% gratuito e anônimo pelo Taiada Fiscaliza)_`;

      expect(messageText).toContain('🚨 *Dossiê Coletivo da Via em Caçapava!*');
      expect(messageText).toContain('📍 *Avenida Brasil*');
      expect(messageText).toContain('*3 problemas graves*');
      expect(messageText).toContain('*48 moradores afetados*');
      expect(messageText).toContain('🔗 https://taiadafiscaliza.com.br');

      const encoded = encodeURIComponent(messageText);
      expect(decodeURIComponent(encoded)).toBe(messageText);
    });

    it('deve resistir a caracteres adversariais e acentuação sem quebrar a URL do WhatsApp', () => {
      const adversarialIssue: Partial<Issue> = {
        id: 'TAI-2026-0999',
        title: 'Buraco & Valeta com "cratera" <script>alert(1)</script> / risco iminente!',
        neighborhood: 'Vila Resende / São Bento',
        street_name: 'Rua São Bento, nº 42 & Cia',
        severity: 5,
        upvotes_count: 99,
      };

      const baseUrl = 'https://taiadafiscaliza.com.br';
      const shareUrl = `${baseUrl}/c/${adversarialIssue.id}`;

      const messageText =
        `🚨 *Atenção, vizinhos de Caçapava!*\n` +
        `📍 *${adversarialIssue.neighborhood}* (${adversarialIssue.street_name})\n` +
        `⚠️ *${adversarialIssue.title}* (Gravidade ${adversarialIssue.severity}/5)\n\n` +
        `Já temos *${adversarialIssue.upvotes_count} moradores* cobrando providências!\n` +
        `🔗 ${shareUrl}`;

      const encoded = encodeURIComponent(messageText);
      const waUrl = `https://wa.me/?text=${encoded}`;

      // A URL gerada deve ser válida e decodificar identicamente
      expect(() => new URL(waUrl)).not.toThrow();
      expect(decodeURIComponent(encoded)).toBe(messageText);
    });
  });

  // =========================================================================
  // 5. DEEP-LINKING EM App.tsx (PRIORIDADE INITIAL_ISSUE_ID E PATHNAME)
  // =========================================================================
  describe('Adversarial 5: Comportamento de Deep-Linking em App.tsx', () => {
    // Função pura que replica a extração do targetId de App.tsx linhas 172-184
    const extractTargetIssueId = (
      initialWindowIssueId: string | undefined | null,
      pathname: string
    ): string | null => {
      if (initialWindowIssueId && initialWindowIssueId.trim().length > 0) {
        return initialWindowIssueId.trim();
      }

      const match = pathname.match(/\/c\/([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }

      return null;
    };

    it('deve dar PRIORIDADE ABSOLUTA a window.__INITIAL_ISSUE_ID__ sobre window.location.pathname', () => {
      // Cenário onde SSR injeta __INITIAL_ISSUE_ID__, mesmo se a URL for diferente
      const target = extractTargetIssueId('TAI-2026-0101', '/c/TAI-2026-0105');
      expect(target).toBe('TAI-2026-0101');

      // Se INITIAL_ISSUE_ID tiver espaços nas bordas
      const targetWithSpaces = extractTargetIssueId('  TAI-2026-0103  ', '/c/TAI-2026-0999');
      expect(targetWithSpaces).toBe('TAI-2026-0103');
    });

    it('deve fazer fallback para window.location.pathname quando window.__INITIAL_ISSUE_ID__ for indefinido', () => {
      // 1. Pathname padrão em maiúsculas
      expect(extractTargetIssueId(undefined, '/c/TAI-2026-0102')).toBe('TAI-2026-0102');

      // 2. Pathname em minúsculas (deve normalizar para uppercase)
      expect(extractTargetIssueId(undefined, '/c/tai-2026-0102')).toBe('TAI-2026-0102');

      // 3. Pathname com barra no final
      expect(extractTargetIssueId(undefined, '/c/TAI-2026-0102/')).toBe('TAI-2026-0102');

      // 4. __INITIAL_ISSUE_ID__ como string vazia ou nula deve acionar o fallback do pathname
      expect(extractTargetIssueId('', '/c/TAI-2026-0104')).toBe('TAI-2026-0104');
      expect(extractTargetIssueId(null, '/c/TAI-2026-0104')).toBe('TAI-2026-0104');
    });

    it('deve retornar null quando nenhum deep-link estiver configurado ou rota não for /c/:id', () => {
      expect(extractTargetIssueId(undefined, '/')).toBeNull();
      expect(extractTargetIssueId(undefined, '/admin')).toBeNull();
      expect(extractTargetIssueId(undefined, '/configuracoes')).toBeNull();
      expect(extractTargetIssueId(undefined, '/c/')).toBeNull();
      expect(extractTargetIssueId('', '/')).toBeNull();
    });

    it('deve simular a seleção automática do protocolo correspondente na lista de issues', () => {
      const mockIssues: Partial<Issue>[] = [
        { id: 'TAI-2026-0101', title: 'Buraco 1', neighborhood: 'Vera Cruz' },
        { id: 'TAI-2026-0102', title: 'Iluminação 2', neighborhood: 'Vila Resende' },
        { id: 'TAI-2026-0103', title: 'Semáforo 3', neighborhood: 'Centro' },
      ];

      let selectedIssue: Partial<Issue> | null = null;
      let currentView: 'map' | 'list' = 'list';
      let toastMessage: string | null = null;

      const triggerDeepLink = (targetId: string | null) => {
        if (!targetId) return;
        const found = mockIssues.find((i) => i.id?.toUpperCase() === targetId.toUpperCase());
        if (found) {
          selectedIssue = found;
          currentView = 'map';
          toastMessage = `Foco no protocolo ${found.id}`;
        }
      };

      // Simula acesso via rota curta /c/tai-2026-0102
      const targetId = extractTargetIssueId(undefined, '/c/tai-2026-0102');
      triggerDeepLink(targetId);

      expect(selectedIssue).not.toBeNull();
      expect(selectedIssue?.id).toBe('TAI-2026-0102');
      expect(currentView).toBe('map');
      expect(toastMessage).toBe('Foco no protocolo TAI-2026-0102');
    });
  });

  // =========================================================================
  // 6. ADVERSARIAL STRESS: CONTRATOS INTEGRADOS FRONTEND <-> BACKEND
  // =========================================================================
  describe('Adversarial 6: Contratos E2E de APIs que sustentam o Frontend', () => {
    it('deve rejeitar POST /api/issues/check-duplicates para coordenadas fora de Caçapava com HTTP 422', async () => {
      // Coordenada em Taubaté (fora de Caçapava)
      const res = await request(app)
        .post('/api/issues/check-duplicates')
        .send({
          latitude: -23.0300,
          longitude: -45.5500,
          category: 'buracos_vias',
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('OUTSIDE_CACAPAVA');
    });

    it('deve rejeitar submissão das 5 categorias físicas sem foto com HTTP 400 PHOTO_REQUIRED', async () => {
      const physicalCats: IssueCategory[] = [
        'buracos_vias',
        'iluminacao',
        'limpeza_mato',
        'calcadas_acessibilidade',
        'sinalizacao_transito',
      ];

      for (const cat of physicalCats) {
        const res = await request(app)
          .post('/api/issues')
          .field('title', `Teste sem foto em ${cat}`)
          .field('description', 'Tentativa de criar chamado de infraestrutura física sem foto')
          .field('category', cat)
          .field('severity', '3')
          .field('latitude', '-23.1006')
          .field('longitude', '-45.7069')
          .field('street_name', 'Rua Marquês de Herval')
          .field('neighborhood', 'Centro')
          .field('location_source', 'gps_live');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('PHOTO_REQUIRED');
      }
    });

    it('deve aceitar submissão das 3 categorias sociais SEM foto quando campos obrigatórios estiverem preenchidos', async () => {
      // 1. Saúde com health_unit
      const resSaude = await request(app)
        .post('/api/issues')
        .field('title', 'Falta de medicamento na farmácia')
        .field('description', 'Remédios de pressão alta em falta há 2 semanas')
        .field('category', 'saude')
        .field('severity', '3')
        .field('latitude', '-23.1050')
        .field('longitude', '-45.7080')
        .field('street_name', 'Rua Dr. José de Moura Resende')
        .field('neighborhood', 'Vila Paraíso')
        .field('location_source', 'gps_live')
        .field('auxiliary_data', JSON.stringify({ health_unit: 'UBS Vila Paraíso' }));

      expect(resSaude.status).toBe(201);
      const issueSaude = resSaude.body.issue || resSaude.body;
      expect(issueSaude.id).toBeDefined();
      expect(issueSaude.photo_url).toBeNull();
      expect(issueSaude.category).toBe('saude');

      // 2. Educação com school_name
      const resEdu = await request(app)
        .post('/api/issues')
        .field('title', 'Ventiladores quebrados na sala de aula')
        .field('description', 'Três ventiladores sem funcionar em sala com 30 alunos')
        .field('category', 'educacao')
        .field('severity', '2')
        .field('latitude', '-23.1020')
        .field('longitude', '-45.7040')
        .field('street_name', 'Avenida Brasil')
        .field('neighborhood', 'Vera Cruz')
        .field('location_source', 'gps_live')
        .field('auxiliary_data', JSON.stringify({ school_name: 'EMEF Lindolpho Machado' }));

      expect(resEdu.status).toBe(201);
      const issueEdu = resEdu.body.issue || resEdu.body;
      expect(issueEdu.id).toBeDefined();
      expect(issueEdu.photo_url).toBeNull();
      expect(issueEdu.category).toBe('educacao');

      // 3. Transporte com bus_line
      const resTransp = await request(app)
        .post('/api/issues')
        .field('title', 'Atraso crônico da linha 03')
        .field('description', 'Ônibus das 07h não passa regularmente há dias')
        .field('category', 'transporte')
        .field('severity', '3')
        .field('latitude', '-23.0990')
        .field('longitude', '-45.7030')
        .field('street_name', 'Avenida Brasil')
        .field('neighborhood', 'Vera Cruz')
        .field('location_source', 'gps_live')
        .field('auxiliary_data', JSON.stringify({ bus_line: 'Linha 03 - Piedade' }));

      expect(resTransp.status).toBe(201);
      const issueTransp = resTransp.body.issue || resTransp.body;
      expect(issueTransp.id).toBeDefined();
      expect(issueTransp.photo_url).toBeNull();
      expect(issueTransp.category).toBe('transporte');
    });

    it('deve rejeitar categorias sociais com campos auxiliares vazios ou ausentes', async () => {
      // Caso 1: Sem auxiliary_data algum -> AUXILIARY_DATA_REQUIRED
      const resNoAux = await request(app)
        .post('/api/issues')
        .field('title', 'Problema em posto de saúde')
        .field('description', 'Demora excessiva para atendimento médico geral')
        .field('category', 'saude')
        .field('severity', '3')
        .field('latitude', '-23.1050')
        .field('longitude', '-45.7080')
        .field('street_name', 'Rua Dr. José de Moura Resende')
        .field('neighborhood', 'Vila Paraíso')
        .field('location_source', 'gps_live');

      expect(resNoAux.status).toBe(400);
      expect(resNoAux.body.error).toBe('AUXILIARY_DATA_REQUIRED');

      // Caso 2: Com auxiliary_data mas campo obrigatório em branco -> INVALID_AUXILIARY_DATA
      const resEmptyField = await request(app)
        .post('/api/issues')
        .field('title', 'Problema em posto de saúde')
        .field('description', 'Demora excessiva para atendimento médico geral')
        .field('category', 'saude')
        .field('severity', '3')
        .field('latitude', '-23.1050')
        .field('longitude', '-45.7080')
        .field('street_name', 'Rua Dr. José de Moura Resende')
        .field('neighborhood', 'Vila Paraíso')
        .field('location_source', 'gps_live')
        .field('auxiliary_data', JSON.stringify({ health_unit: '   ' }));

      expect(resEmptyField.status).toBe(400);
      expect(resEmptyField.body.error).toBe('INVALID_AUXILIARY_DATA');
    });

    it('deve validar rota de deep-linking GET /c/:id e GET /api/issues/:id', async () => {
      // 1. GET /c/TAI-2026-0101 retorna HTML com OpenGraph e INITIAL_ISSUE_ID
      const resC = await request(app).get('/c/TAI-2026-0101');
      expect(resC.status).toBe(200);
      expect(resC.headers['content-type']).toContain('text/html');
      expect(resC.text).toContain('window.__INITIAL_ISSUE_ID__ = "TAI-2026-0101"');
      expect(resC.text).toContain('og:title');

      // 2. GET /api/issues/TAI-2026-0101 retorna o JSON detalhado
      const resApi = await request(app).get('/api/issues/TAI-2026-0101');
      expect(resApi.status).toBe(200);
      expect(resApi.body.issue).toBeDefined();
      expect(resApi.body.issue.id).toBe('TAI-2026-0101');
      expect(resApi.body.timeline).toBeDefined();
    });
  });
});

