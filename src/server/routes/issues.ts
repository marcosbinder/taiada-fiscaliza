/**
 * src/server/routes/issues.ts
 *
 * Rotas de Gestão de Demandas Cívicas, Deduplicação em 2 Níveis,
 * Pipeline de Imagem e Consenso Comunitário Waze para o Taiada Fiscaliza ("Cobra, Taiada!").
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { getDb } from '../db';
import { env } from '../../config/env';
import {
  isWithinCacapava,
  haversineDistanceMeters,
  buildStreetGroupKey,
  DUPLICATE_RADIUS_METERS,
  PRESENTIAL_RADIUS_METERS,
  EXIF_LOCAL_VERIFIED_RADIUS_METERS,
} from '../../shared/geo';
import {
  isPhotoRequired,
  getCategoryDefinition,
  validateAuxiliaryData,
  CATEGORY_MAP,
} from '../../shared/categories';
import {
  Issue,
  IssueCategory,
  IssueSeverity,
  LocationSource,
  ResolutionStatus,
  ModerationStatus,
  StreetDossier,
  StreetDossierPoint,
  DuplicateCandidate,
  CheckDuplicatesResponse,
} from '../../shared/types';
import {
  findDuplicates,
  aggregateStreetDossiers,
  checkGeofence,
} from '../services/geoService';
import {
  extractExifMetadata,
  analyzeImageQuality,
  sanitizeAndSaveImage,
  validateCategoryPhotoRequirement,
} from '../services/imagePipeline';
import {
  computeVoteWeight,
  calculateConsensusScore,
  evaluateResolutionState,
  recalculateIssueConsensus as engineRecalculateIssueConsensus,
} from '../services/consensusEngine';
import {
  validateAndSanitizeAuthorName,
  computeTrustScore,
  dispatchWebhookAlert,
} from '../services/securityService';

export const issuesRouter = Router();

// Configuração do Multer com armazenamento estritamente em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // Limite máximo de 15MB por foto bruta
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Formato de imagem não suportado. Envie JPG, PNG, WebP ou HEIC.'));
    }
  },
});

/**
 * Recalcula o saldo de consenso Waze e atualiza a máquina de estados.
 * Exportado para uso nas rotas admin.
 */
export function recalculateIssueConsensus(issueId: string): {
  consensus_score: number;
  resolution_status: ResolutionStatus;
  reopened_count: number;
} {
  const db = getDb();
  const res = engineRecalculateIssueConsensus(db, issueId);
  return {
    consensus_score: res.updatedScore,
    resolution_status: res.updatedStatus,
    reopened_count: res.reopenedCount,
  };
}

// ==========================================
// 1. GET /api/issues — Listagem com Optimistic UI e Dossiês de Rua
// ==========================================
issuesRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const requesterHash = req.device?.device_hash || '';

    const { category, status, street_group_key, neighborhood } = req.query;

    let querySql = `
      SELECT * FROM issues
      WHERE (
        (moderation_status IN ('auto_approved', 'approved') AND is_shadowbanned = 0)
        OR
        (device_hash = ? AND moderation_status != 'rejected')
      )
    `;
    const params: unknown[] = [requesterHash];

    if (category && typeof category === 'string' && category in CATEGORY_MAP) {
      querySql += ` AND category = ?`;
      params.push(category);
    }

    if (status && typeof status === 'string') {
      querySql += ` AND resolution_status = ?`;
      params.push(status);
    }

    if (street_group_key && typeof street_group_key === 'string') {
      querySql += ` AND street_group_key = ?`;
      params.push(street_group_key);
    }

    if (neighborhood && typeof neighborhood === 'string') {
      querySql += ` AND neighborhood = ?`;
      params.push(neighborhood);
    }

    querySql += ` ORDER BY created_at DESC`;

    const rawIssues = db.prepare(querySql).all(...params) as Issue[];

    const getVotesStmt = db.prepare(
      `SELECT vote_type FROM issue_votes WHERE issue_id = ? AND device_hash = ?`
    );
    const getContribsCountStmt = db.prepare(
      `SELECT COUNT(*) as count FROM issue_contributions WHERE issue_id = ? AND (is_shadowbanned = 0 OR device_hash = ?)`
    );

    const issues = rawIssues.map((issue) => {
      const userVotesRows = getVotesStmt.all(issue.id, requesterHash) as Array<{
        vote_type: string;
      }>;
      const contribRow = getContribsCountStmt.get(issue.id, requesterHash) as { count: number };

      let parsedAux: Record<string, unknown> | undefined;
      if (issue.auxiliary_data) {
        try {
          parsedAux = JSON.parse(issue.auxiliary_data);
        } catch {
          // Ignore
        }
      }

      return {
        ...issue,
        is_mine: issue.device_hash === requesterHash,
        user_votes: userVotesRows.map((r) => r.vote_type),
        contributions_count: contribRow ? contribRow.count : 0,
        parsed_auxiliary_data: parsedAux,
      };
    });

    // 2. Agrupamento de Dossiês de Rua (Nível 2)
    const street_dossiers = aggregateStreetDossiers(db);

    // 3. Estatísticas Globais
    const statsRow = db
      .prepare(
        `SELECT
           COUNT(CASE WHEN resolution_status IN ('open', 'verifying_resolution', 'reopened') AND moderation_status IN ('auto_approved', 'approved') AND is_shadowbanned = 0 THEN 1 END) as total_active,
           COUNT(CASE WHEN resolution_status IN ('resolved_community', 'resolved_official') AND is_shadowbanned = 0 THEN 1 END) as total_resolved,
           COUNT(CASE WHEN reopened_count > 0 AND is_shadowbanned = 0 THEN 1 END) as total_reopened,
           COALESCE(SUM(CASE WHEN is_shadowbanned = 0 THEN upvotes_count ELSE 0 END), 0) as total_supporters
         FROM issues`
      )
      .get() as {
      total_active: number;
      total_resolved: number;
      total_reopened: number;
      total_supporters: number;
    };

    const stats = {
      total_active: statsRow.total_active || 0,
      total_resolved: statsRow.total_resolved || 0,
      total_reopened: statsRow.total_reopened || 0,
      total_supporters: statsRow.total_supporters || 0,
      total_issues: (statsRow.total_active || 0) + (statsRow.total_resolved || 0),
      resolved_issues: statsRow.total_resolved || 0,
      total_upvotes: statsRow.total_supporters || 0,
      active_dossiers: street_dossiers.length,
    };

    return res.json({
      device_hash_short: requesterHash.slice(0, 8),
      issues,
      street_dossiers,
      stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em GET /api/issues:', message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erro ao listar chamados.' });
  }
});

// ==========================================
// 2. POST /api/issues/check-duplicates — Validação Geofence e Deduplicação <= 40m
// ==========================================
issuesRouter.post('/check-duplicates', (req: Request, res: Response) => {
  try {
    const { latitude, longitude, category, street_name } = req.body;

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      return res.status(400).json({
        error: 'INVALID_COORDINATES',
        message: 'Coordenadas de latitude e longitude inválidas ou ausentes.',
      });
    }

    // Trava de Geofencing Caçapava (HTTP 422)
    if (!isWithinCacapava(latitude, longitude)) {
      return res.status(422).json({
        error: 'OUTSIDE_CACAPAVA',
        message:
          'O Taiada Fiscaliza atende exclusivamente o município de Caçapava - SP. A coordenada informada está fora do perímetro municipal.',
      });
    }

    if (!category || !(category in CATEGORY_MAP)) {
      return res.status(400).json({
        error: 'INVALID_CATEGORY',
        message: 'Categoria informada inválida ou ausente.',
      });
    }

    const db = getDb();
    const result = findDuplicates(db, {
      latitude,
      longitude,
      category: category as IssueCategory,
      street_name,
    });

    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em POST /api/issues/check-duplicates:', message);
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: 'Erro ao verificar duplicatas.' });
  }
});

// ==========================================
// 3. GET /api/issues/:id — Detalhe da Demanda, Contribuições e Timeline
// ==========================================
issuesRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const requesterHash = req.device?.device_hash || '';

    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue | undefined;

    if (!issue) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Chamado não encontrado.' });
    }

    // Se estiver em shadowban e não for o autor, oculta
    if (issue.is_shadowbanned === 1 && issue.device_hash !== requesterHash) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Chamado não encontrado.' });
    }

    // Contribuições vinculadas
    const contributions = db
      .prepare(
        `SELECT * FROM issue_contributions 
         WHERE issue_id = ? AND (is_shadowbanned = 0 OR device_hash = ?)
         ORDER BY created_at ASC`
      )
      .all(id, requesterHash);

    // Linha do tempo auditável
    const timeline = db
      .prepare(
        `SELECT * FROM issue_timeline 
         WHERE issue_id = ? 
         ORDER BY created_at ASC`
      )
      .all(id);

    // Votos do requisitante
    const userVotes = db
      .prepare(`SELECT vote_type FROM issue_votes WHERE issue_id = ? AND device_hash = ?`)
      .all(id, requesterHash) as Array<{ vote_type: string }>;

    // Contagem de votos presenciais
    const presentialCountRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM issue_votes 
         WHERE issue_id = ? AND is_presential_gps = 1 AND is_shadowbanned = 0`
      )
      .get(id) as { count: number };

    let parsedAux: Record<string, unknown> | undefined;
    if (issue.auxiliary_data) {
      try {
        parsedAux = JSON.parse(issue.auxiliary_data);
      } catch {
        // Ignore
      }
    }

    const votes_summary = {
      total_upvotes: issue.upvotes_count,
      presential_votes_count: presentialCountRow ? presentialCountRow.count : 0,
      consensus_score: issue.consensus_score,
      reopened_count: issue.reopened_count,
    };

    return res.json({
      ...issue,
      issue,
      is_mine: issue.device_hash === requesterHash,
      user_votes: userVotes.map((v) => v.vote_type),
      parsed_auxiliary_data: parsedAux,
      contributions,
      timeline,
      votes_summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em GET /api/issues/:id:', message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erro ao carregar detalhes.' });
  }
});

// ==========================================
// 4. POST /api/issues — Criação de Demanda, Pipeline Sharp WebP e Trust Score
// ==========================================
issuesRouter.post('/', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const device = req.device;

    const {
      title,
      description,
      category,
      severity: rawSeverity,
      latitude: rawLat,
      longitude: rawLng,
      raw_latitude: rawInputLat,
      raw_longitude: rawInputLng,
      street_name,
      neighborhood,
      reference_point,
      location_source,
      gps_accuracy_meters: rawGpsAcc,
      author_name,
      auxiliary_data,
    } = req.body;

    // 1. Validação básica de campos obrigatórios
    if (!title || typeof title !== 'string' || title.trim().length < 5) {
      return res.status(400).json({
        error: 'INVALID_TITLE',
        message: 'O título da demanda deve ter pelo menos 5 caracteres.',
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({
        error: 'INVALID_DESCRIPTION',
        message: 'A descrição da demanda deve ter pelo menos 10 caracteres explicativos.',
      });
    }

    if (!category || !(category in CATEGORY_MAP)) {
      return res.status(400).json({
        error: 'INVALID_CATEGORY',
        message: 'Categoria informada inválida ou inexistente.',
      });
    }

    const severity = parseInt(rawSeverity, 10);
    if (isNaN(severity) || severity < 1 || severity > 5) {
      return res.status(400).json({
        error: 'INVALID_SEVERITY',
        message: 'A gravidade deve ser um número inteiro entre 1 e 5.',
      });
    }

    const latitude = parseFloat(rawLat);
    const longitude = parseFloat(rawLng);
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: 'INVALID_COORDINATES',
        message: 'Coordenadas de latitude e longitude inválidas ou ausentes.',
      });
    }

    // Trava de Geofencing Caçapava (HTTP 422)
    if (!isWithinCacapava(latitude, longitude)) {
      return res.status(422).json({
        error: 'OUTSIDE_CACAPAVA',
        message:
          'O Taiada Fiscaliza atende exclusivamente o município de Caçapava - SP. A coordenada informada está fora do perímetro municipal.',
      });
    }

    if (!street_name || typeof street_name !== 'string' || street_name.trim().length === 0) {
      return res.status(400).json({
        error: 'INVALID_STREET',
        message: 'O nome do logradouro é obrigatório.',
      });
    }

    if (!neighborhood || typeof neighborhood !== 'string' || neighborhood.trim().length === 0) {
      return res.status(400).json({
        error: 'INVALID_NEIGHBORHOOD',
        message: 'O bairro de Caçapava é obrigatório.',
      });
    }

    // 2. Validação condicional de foto
    const categoryDef = getCategoryDefinition(category as IssueCategory);
    const hasPhoto = Boolean(req.file);

    if (categoryDef.photoRequired && !hasPhoto) {
      return res.status(400).json({
        error: 'PHOTO_REQUIRED',
        message: `A categoria "${categoryDef.label}" exige o anexo de foto comprovatória.`,
      });
    }

    let validatedAuxData: Record<string, unknown> | null = null;

    if (!hasPhoto && !categoryDef.photoRequired) {
      if (!auxiliary_data) {
        return res.status(400).json({
          error: 'AUXILIARY_DATA_REQUIRED',
          message: `Relatos sem foto na categoria "${categoryDef.label}" exigem o preenchimento dos campos específicos.`,
        });
      }
      let auxObj: Record<string, unknown>;
      try {
        auxObj = typeof auxiliary_data === 'string' ? JSON.parse(auxiliary_data) : auxiliary_data;
      } catch {
        return res.status(400).json({
          error: 'INVALID_AUXILIARY_DATA',
          message: 'Os dados complementares enviados estão em formato inválido.',
        });
      }
      const validation = validateAuxiliaryData(category as IssueCategory, auxObj);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'INVALID_AUXILIARY_DATA',
          message: validation.errors.join(' '),
        });
      }
      validatedAuxData = auxObj;
    } else if (auxiliary_data) {
      try {
        const auxObj =
          typeof auxiliary_data === 'string' ? JSON.parse(auxiliary_data) : auxiliary_data;
        const validation = validateAuxiliaryData(category as IssueCategory, auxObj);
        if (validation.valid) {
          validatedAuxData = auxObj;
        }
      } catch {
        // Ignora JSON corrompido quando foto foi fornecida
      }
    }

    // 3. Sanitização do autor
    let cleanAuthorName: string | null = null;
    if (author_name) {
      const authorVal = validateAndSanitizeAuthorName(author_name);
      if (!authorVal.valid) {
        return res.status(400).json({
          error: 'INVALID_AUTHOR',
          message: authorVal.error || 'Nome de autor inválido.',
        });
      }
      cleanAuthorName = authorVal.cleanName;
    }

    // 4. Processamento de imagem em memória (Sharp WebP + EXIF seletivo)
    let photoUrl: string | null = null;
    let exifCapturedAt: string | null = null;
    let exifLatitude: number | null = null;
    let exifLongitude: number | null = null;
    let exifDistanceMeters: number | null = null;
    let exifVerifiedLocal = 0;
    let isSuspiciousImage = false;

    if (req.file) {
      const buffer = req.file.buffer;

      // Extração seletiva EXIF
      const exifResult = await extractExifMetadata(buffer, latitude, longitude);
      if (exifResult.hasExif) {
        exifCapturedAt = exifResult.capturedAt;
        exifLatitude = exifResult.latitude;
        exifLongitude = exifResult.longitude;
        exifDistanceMeters = exifResult.distanceMeters;
        exifVerifiedLocal = exifResult.isVerifiedLocal;
      }

      // Sanitização WebP e gravação no disco
      const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
      const sanitized = await sanitizeAndSaveImage(buffer, uploadsDir, 'issue');
      photoUrl = sanitized.photoUrl;
      isSuspiciousImage = sanitized.qualityReport.isSuspicious;
    }

    // 5. Cálculo dinâmico do trust_score
    const gpsAccuracy = rawGpsAcc ? parseFloat(rawGpsAcc) : null;
    const trustResult = computeTrustScore(db, {
      device_hash: device.device_hash,
      location_source: (location_source as LocationSource) || 'manual_pin',
      gps_accuracy_meters: gpsAccuracy,
      exif_verified_local: exifVerifiedLocal,
      isSuspiciousImage,
      title: title.trim(),
      description: description.trim(),
      author_name: cleanAuthorName,
    });

    const isShadowbanned = device.is_shadowbanned ? 1 : 0;
    const now = Date.now();
    const currentYear = new Date(now).getFullYear();
    const streetGroupKey = buildStreetGroupKey(street_name, category);

    // 6. Geração de Protocolo Sequencial TAI-YYYY-XXXX em Transação
    let createdIssue: Issue | null = null;

    const createTransaction = db.transaction(() => {
      // Busca maior sequência do ano
      const seqPattern = `TAI-${currentYear}-%`;
      const lastRow = db
        .prepare(`SELECT id FROM issues WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
        .get(seqPattern) as { id: string } | undefined;

      let nextNum = 101;
      if (lastRow) {
        const parts = lastRow.id.split('-');
        if (parts.length === 3) {
          const parsedNum = parseInt(parts[2], 10);
          if (!isNaN(parsedNum)) {
            nextNum = parsedNum + 1;
          }
        }
      }

      const issueId = `TAI-${currentYear}-${String(nextNum).padStart(4, '0')}`;

      // Dados auxiliares validados em JSON
      const auxJson: string | null = validatedAuxData ? JSON.stringify(validatedAuxData) : null;

      const rawLatitude = rawInputLat ? parseFloat(rawInputLat) : null;
      const rawLongitude = rawInputLng ? parseFloat(rawInputLng) : null;

      db.prepare(
        `INSERT INTO issues (
           id, title, description, category, severity,
           auxiliary_data, raw_latitude, raw_longitude, latitude, longitude,
           street_name, street_group_key, neighborhood, reference_point,
           location_source, gps_accuracy_meters,
           photo_url, exif_captured_at, exif_latitude, exif_longitude,
           exif_distance_meters, exif_verified_local,
           author_name, device_hash, trust_score, moderation_status,
           is_shadowbanned, resolution_status, official_status,
           official_protocol_number, upvotes_count, consensus_score,
           reopened_count, created_at, updated_at
         ) VALUES (
           ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?,
           ?, ?, ?, ?,
           ?, ?,
           ?, ?, ?, ?,
           ?, 'open', 'received',
           NULL, 1, 0.0,
           0, ?, ?
         )`
      ).run(
        issueId,
        title.trim(),
        description.trim(),
        category,
        severity,
        auxJson,
        rawLatitude,
        rawLongitude,
        latitude,
        longitude,
        street_name.trim(),
        streetGroupKey,
        neighborhood.trim(),
        reference_point ? reference_point.trim() : null,
        location_source || 'manual_pin',
        gpsAccuracy,
        photoUrl,
        exifCapturedAt,
        exifLatitude,
        exifLongitude,
        exifDistanceMeters,
        exifVerifiedLocal,
        cleanAuthorName,
        device.device_hash,
        trustResult.trustScore,
        trustResult.moderationStatus,
        isShadowbanned,
        now,
        now
      );

      // Registra evento na linha do tempo
      db.prepare(
        `INSERT INTO issue_timeline (issue_id, event_type, title, description, created_at)
         VALUES (?, 'created', 'Demanda Registrada', ?, ?)`
      ).run(issueId, `Protocolo gerado pelo munícipe via ${location_source || 'aplicativo'}.`, now);

      // Registra o primeiro voto de upvote do autor automaticamente
      db.prepare(
        `INSERT INTO issue_votes (
           issue_id, device_hash, vote_type, voter_latitude, voter_longitude,
           distance_to_issue_meters, is_presential_gps, has_proof_photo,
           proof_photo_url, vote_weight, note, is_shadowbanned, created_at
         ) VALUES (
           ?, ?, 'upvote', ?, ?,
           0, 1, ?,
           ?, 1.0, 'Voto inicial do autor', ?, ?
         )`
      ).run(
        issueId,
        device.device_hash,
        latitude,
        longitude,
        hasPhoto ? 1 : 0,
        photoUrl,
        isShadowbanned,
        now
      );

      createdIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as Issue;
    });

    createTransaction();

    if (!createdIssue) {
      throw new Error('Falha ao instanciar chamado na transação.');
    }

    const shareUrl = `${env.PUBLIC_BASE_URL}/c/${(createdIssue as Issue).id}`;

    // Disparo assíncrono de webhook (não bloqueante)
    dispatchWebhookAlert({
      type: 'issue_created',
      title: `Nova demanda: ${(createdIssue as Issue).title}`,
      description: `Bairro: ${(createdIssue as Issue).neighborhood} | Rua: ${(createdIssue as Issue).street_name}`,
      issueId: (createdIssue as Issue).id,
      category: (createdIssue as Issue).category,
      severity: (createdIssue as Issue).severity,
      url: shareUrl,
    }).catch(() => {});

    return res.status(201).json({
      ...(createdIssue as Issue),
      share_url: shareUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em POST /api/issues:', message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message });
  }
});

// ==========================================
// 5. POST /api/issues/:id/contribute — Somar Apoio e Foto a Chamado Existente (Opção A)
// ==========================================
issuesRouter.post(
  '/:id/contribute',
  upload.single('photo'),
  async (req: Request, res: Response) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const device = req.device;
      const { note, author_name } = req.body;

      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue | undefined;
      if (!issue) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Chamado não encontrado.' });
      }

      let cleanAuthorName: string | null = null;
      if (author_name) {
        const authorVal = validateAndSanitizeAuthorName(author_name);
        if (!authorVal.valid) {
          return res.status(400).json({
            error: 'INVALID_AUTHOR',
            message: authorVal.error || 'Nome de autor inválido.',
          });
        }
        cleanAuthorName = authorVal.cleanName;
      }

      let photoUrl: string | null = null;
      let exifCapturedAt: string | null = null;
      let exifVerifiedLocal = 0;

      if (req.file) {
        const buffer = req.file.buffer;
        const exifResult = await extractExifMetadata(buffer, issue.latitude, issue.longitude);
        if (exifResult.hasExif) {
          exifCapturedAt = exifResult.capturedAt;
          exifVerifiedLocal = exifResult.isVerifiedLocal;
        }

        const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
        const sanitized = await sanitizeAndSaveImage(buffer, uploadsDir, 'contrib');
        photoUrl = sanitized.photoUrl;
      }

      const now = Date.now();
      const isShadowbanned = device.is_shadowbanned ? 1 : 0;

      db.transaction(() => {
        // Insere contribuição
        db.prepare(
          `INSERT INTO issue_contributions (
             issue_id, device_hash, author_name, note, photo_url,
             exif_captured_at, exif_verified_local, is_shadowbanned, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          device.device_hash,
          cleanAuthorName,
          note ? note.trim() : null,
          photoUrl,
          exifCapturedAt,
          exifVerifiedLocal,
          isShadowbanned,
          now
        );

        // Registra upvote se ainda não votou
        const existingVote = db
          .prepare(
            `SELECT id FROM issue_votes WHERE issue_id = ? AND device_hash = ? AND vote_type = 'upvote'`
          )
          .get(id, device.device_hash);

        if (!existingVote) {
          db.prepare(
            `INSERT INTO issue_votes (
               issue_id, device_hash, vote_type, voter_latitude, voter_longitude,
               distance_to_issue_meters, is_presential_gps, has_proof_photo,
               proof_photo_url, vote_weight, note, is_shadowbanned, created_at
             ) VALUES (
               ?, ?, 'upvote', ?, ?,
               0, 1, ?,
               ?, 1.0, ?, ?, ?
             )`
          ).run(
            id,
            device.device_hash,
            issue.latitude,
            issue.longitude,
            photoUrl ? 1 : 0,
            photoUrl,
            note ? note.trim() : 'Apoio somado na mesma via',
            isShadowbanned,
            now
          );

          if (!isShadowbanned) {
            db.prepare(
              `UPDATE issues SET upvotes_count = upvotes_count + 1, updated_at = ? WHERE id = ?`
            ).run(now, id);
          }
        }

        // Linha do tempo
        db.prepare(
          `INSERT INTO issue_timeline (issue_id, event_type, title, description, created_at)
           VALUES (?, 'merged_support', 'Novo Apoio e Evidência Somados', ?, ?)`
        ).run(
          id,
          note ? `Relato adicional: "${note.trim()}"` : 'Morador somou apoio a este chamado.',
          now
        );
      })();

      const updated = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue;
      return res.status(201).json({
        success: true,
        message: 'Apoio somado com sucesso ao chamado.',
        issue: updated,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Erro em POST /api/issues/:id/contribute:', message);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  }
);

// ==========================================
// 6. POST /api/issues/:id/interact — Consenso Waze, Prova GPS e Reabertura
// ==========================================
issuesRouter.post(
  '/:id/interact',
  upload.single('proof_photo'),
  async (req: Request, res: Response) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const device = req.device;

      const {
        vote_type,
        voter_latitude: rawVoterLat,
        voter_longitude: rawVoterLng,
        note,
      } = req.body;

      if (
        !vote_type ||
        !['upvote', 'resolved_yes', 'resolved_no_returned'].includes(vote_type)
      ) {
        return res.status(400).json({
          error: 'INVALID_VOTE_TYPE',
          message:
            'Tipo de voto inválido. Valores aceitos: upvote, resolved_yes, resolved_no_returned.',
        });
      }

      const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue | undefined;
      if (!issue) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Chamado não encontrado.' });
      }

      const now = Date.now();
      const isShadowbanned = device.is_shadowbanned ? 1 : 0;

      // 1. Caso seja Upvote Simples (Prioridade Comunitária)
      if (vote_type === 'upvote') {
        const existingUpvote = db
          .prepare(
            `SELECT id FROM issue_votes WHERE issue_id = ? AND device_hash = ? AND vote_type = 'upvote'`
          )
          .get(id, device.device_hash);

        if (!existingUpvote) {
          db.prepare(
            `INSERT INTO issue_votes (
               issue_id, device_hash, vote_type, voter_latitude, voter_longitude,
               distance_to_issue_meters, is_presential_gps, has_proof_photo,
               proof_photo_url, vote_weight, note, is_shadowbanned, created_at
             ) VALUES (?, ?, 'upvote', NULL, NULL, NULL, 0, 0, NULL, 1.0, ?, ?, ?)`
          ).run(id, device.device_hash, note ? note.trim() : null, isShadowbanned, now);

          if (!isShadowbanned) {
            db.prepare(
              'UPDATE issues SET upvotes_count = upvotes_count + 1, updated_at = ? WHERE id = ?'
            ).run(now, id);
          }
        }

        const freshIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue;
        return res.json({
          success: true,
          vote_type: 'upvote',
          upvotes_count: freshIssue.upvotes_count,
          consensus_score: freshIssue.consensus_score,
          resolution_status: freshIssue.resolution_status,
        });
      }

      // 2. Votos de Validação Comunitária Waze (resolved_yes ou resolved_no_returned)
      const voterLat = rawVoterLat ? parseFloat(rawVoterLat) : null;
      const voterLng = rawVoterLng ? parseFloat(rawVoterLng) : null;
      let hasProofPhoto = false;
      let proofPhotoUrl: string | null = null;

      if (req.file) {
        const uploadsDir = path.resolve(process.cwd(), env.UPLOADS_DIR);
        const sanitized = await sanitizeAndSaveImage(req.file.buffer, uploadsDir, 'proof');
        proofPhotoUrl = sanitized.photoUrl;
        hasProofPhoto = true;
      }

      // Cálculo de distância e peso via consensusEngine
      const weightAnalysis = computeVoteWeight({
        voter_latitude: voterLat,
        voter_longitude: voterLng,
        has_proof_photo: hasProofPhoto,
        issue_latitude: issue.latitude,
        issue_longitude: issue.longitude,
      });

      // Grava ou atualiza voto de resolução do dispositivo para esta demanda
      const existingVote = db
        .prepare(
          `SELECT id FROM issue_votes 
           WHERE issue_id = ? AND device_hash = ? AND vote_type IN ('resolved_yes', 'resolved_no_returned')`
        )
        .get(id, device.device_hash) as { id: number } | undefined;

      if (existingVote) {
        db.prepare(
          `UPDATE issue_votes
           SET vote_type = ?, voter_latitude = ?, voter_longitude = ?,
               distance_to_issue_meters = ?, is_presential_gps = ?,
               has_proof_photo = ?, proof_photo_url = ?, vote_weight = ?,
               note = ?, is_shadowbanned = ?, created_at = ?
           WHERE id = ?`
        ).run(
          vote_type,
          voterLat,
          voterLng,
          weightAnalysis.distance_to_issue_meters,
          weightAnalysis.is_presential_gps,
          hasProofPhoto ? 1 : 0,
          proofPhotoUrl,
          weightAnalysis.vote_weight,
          note ? note.trim() : null,
          isShadowbanned,
          now,
          existingVote.id
        );
      } else {
        db.prepare(
          `INSERT INTO issue_votes (
             issue_id, device_hash, vote_type, voter_latitude, voter_longitude,
             distance_to_issue_meters, is_presential_gps, has_proof_photo,
             proof_photo_url, vote_weight, note, is_shadowbanned, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          device.device_hash,
          vote_type,
          voterLat,
          voterLng,
          weightAnalysis.distance_to_issue_meters,
          weightAnalysis.is_presential_gps,
          hasProofPhoto ? 1 : 0,
          proofPhotoUrl,
          weightAnalysis.vote_weight,
          note ? note.trim() : null,
          isShadowbanned,
          now
        );
      }

      // Recalcula o consenso e atualiza a máquina de estados
      const consensusResult = recalculateIssueConsensus(id);
      const freshIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue;

      return res.json({
        success: true,
        vote_type,
        vote_weight: weightAnalysis.vote_weight,
        is_presential_gps: weightAnalysis.is_presential_gps === 1,
        distance_meters: weightAnalysis.distance_to_issue_meters,
        consensus_score: consensusResult.consensus_score,
        resolution_status: consensusResult.resolution_status,
        reopened_count: consensusResult.reopened_count,
        upvotes_count: freshIssue.upvotes_count,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Erro em POST /api/issues/:id/interact:', message);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  }
);
