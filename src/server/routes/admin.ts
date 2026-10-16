/**
 * src/server/routes/admin.ts
 *
 * Rotas Administrativas e de Moderação do Taiada Fiscaliza ("Cobra, Taiada!").
 * Protegido via token de portador (Authorization: Bearer <ADMIN_TOKEN>).
 * Permite moderação de fila pending_review, vinculação de protocolo oficial,
 * acionamento do Expurgo em 1 Clique (72h) com recálculo ACID e Shadowban.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';
import { getDb } from '../db';
import { env } from '../../config/env';
import { Issue, ModerationStatus, OfficialStatus } from '../../shared/types';
import { purgeDevice } from '../services/securityService';
import { recalculateIssueConsensus } from './issues';

export const adminRouter = Router();

// ==========================================
// Middleware de Autenticação Administrativa
// ==========================================
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token de autorização Bearer ausente ou inválido.',
    });
    return;
  }

  const providedToken = authHeader.slice(7).trim();
  const expectedToken = env.ADMIN_TOKEN;

  const providedBuf = Buffer.from(providedToken);
  const expectedBuf = Buffer.from(expectedToken);

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token de administração inválido.',
    });
    return;
  }

  next();
}

// Aplica autenticação em todas as rotas administrativas
adminRouter.use(adminAuthMiddleware);

// ==========================================
// 1. GET /api/admin/overview — Fila de Moderação e Métricas
// ==========================================
adminRouter.get('/overview', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    // Chamados pendentes de revisão (trust_score < 60)
    const pendingModeration = db
      .prepare(
        `SELECT * FROM issues 
         WHERE moderation_status = 'pending_review' 
         ORDER BY created_at ASC`
      )
      .all() as Issue[];

    // Chamados sinalizados
    const flaggedIssues = db
      .prepare(
        `SELECT * FROM issues 
         WHERE moderation_status = 'flagged' 
         ORDER BY created_at DESC`
      )
      .all() as Issue[];

    // Dispositivos banidos ou em shadowban
    const blockedDevices = db
      .prepare(`SELECT * FROM blocked_devices ORDER BY created_at DESC`)
      .all();

    // Métricas gerais
    const metricsRow = db
      .prepare(
        `SELECT
           COUNT(*) as total_issues,
           COUNT(CASE WHEN moderation_status = 'pending_review' THEN 1 END) as pending_count,
           COUNT(CASE WHEN moderation_status = 'auto_approved' THEN 1 END) as auto_approved_count,
           COUNT(CASE WHEN moderation_status = 'approved' THEN 1 END) as approved_count,
           COUNT(CASE WHEN moderation_status = 'rejected' THEN 1 END) as rejected_count,
           COUNT(CASE WHEN reopened_count > 0 THEN 1 END) as reopened_count
         FROM issues`
      )
      .get() as {
      total_issues: number;
      pending_count: number;
      auto_approved_count: number;
      approved_count: number;
      rejected_count: number;
      reopened_count: number;
    };

    const blockedCountRow = db
      .prepare(`SELECT COUNT(*) as count FROM blocked_devices`)
      .get() as { count: number };

    const votesCountRow = db
      .prepare(`SELECT COUNT(*) as count FROM issue_votes`)
      .get() as { count: number };

    return res.json({
      pending_moderation: pendingModeration,
      flagged_issues: flaggedIssues,
      blocked_devices: blockedDevices,
      metrics: {
        total_issues: metricsRow.total_issues,
        pending_count: metricsRow.pending_count,
        auto_approved_count: metricsRow.auto_approved_count,
        approved_count: metricsRow.approved_count,
        rejected_count: metricsRow.rejected_count,
        reopened_count: metricsRow.reopened_count,
        shadowbanned_devices_count: blockedCountRow.count,
        total_votes: votesCountRow.count,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em GET /api/admin/overview:', message);
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: 'Erro ao carregar visão administrativa.' });
  }
});

// ==========================================
// 2. POST /api/admin/moderation/:id — Aprovação, Rejeição e Protocolo Oficial
// ==========================================
adminRouter.post('/moderation/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      moderation_status,
      official_status,
      official_protocol_number,
      note,
    } = req.body;

    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue | undefined;
    if (!issue) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Chamado não encontrado.' });
    }

    const now = Date.now();
    const newModStatus = (moderation_status || issue.moderation_status) as ModerationStatus;
    const newOffStatus = (official_status || issue.official_status) as OfficialStatus;
    const newProtocol =
      official_protocol_number !== undefined
        ? official_protocol_number
        : issue.official_protocol_number;

    db.transaction(() => {
      db.prepare(
        `UPDATE issues
         SET moderation_status = ?, official_status = ?, official_protocol_number = ?, updated_at = ?
         WHERE id = ?`
      ).run(newModStatus, newOffStatus, newProtocol, now, id);

      // Evento de protocolo oficial anexado
      if (
        official_protocol_number &&
        official_protocol_number !== issue.official_protocol_number
      ) {
        db.prepare(
          `INSERT INTO issue_timeline (issue_id, event_type, title, description, created_at)
           VALUES (?, 'official_protocol', 'Protocolo Oficial Vinculado', ?, ?)`
        ).run(
          id,
          `Protocolo oficial do Gabinete / Câmara: ${official_protocol_number}`,
          now
        );
      }

      // Evento de moderação de status
      if (moderation_status && moderation_status !== issue.moderation_status) {
        const titleText =
          moderation_status === 'approved'
            ? 'Demanda Aprovada pela Moderação'
            : moderation_status === 'rejected'
            ? 'Demanda Rejeitada pela Moderação'
            : 'Status de Moderação Atualizado';

        const descText = note || `Status alterado para ${moderation_status}.`;

        db.prepare(
          `INSERT INTO issue_timeline (issue_id, event_type, title, description, created_at)
           VALUES (?, 'moderated', ?, ?, ?)`
        ).run(id, titleText, descText, now);
      }
    })();

    const updatedIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Issue;
    return res.json({
      success: true,
      issue: updatedIssue,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em POST /api/admin/moderation/:id:', message);
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: 'Erro ao moderar demanda.' });
  }
});

// ==========================================
// 3. POST /api/admin/purge-device — Expurgo em 1 Clique e Shadowban
// ==========================================
adminRouter.post('/purge-device', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { device_hash, reason, mode } = req.body;

    if (!device_hash || typeof device_hash !== 'string' || device_hash.trim().length === 0) {
      return res.status(400).json({
        error: 'INVALID_DEVICE_HASH',
        message: 'O device_hash do infrator é obrigatório.',
      });
    }

    const targetHash = device_hash.trim();
    const result = purgeDevice(db, {
      device_hash: targetHash,
      reason: reason || 'Expurgo administrativo em 1 clique',
      mode: mode || 'purge_and_shadowban',
    });

    return res.json({
      success: true,
      shadowbanned: result.shadowbanned,
      purged_issues_count: result.purged_issues_count,
      purged_votes_count: result.purged_votes_count,
      purged_contributions_count: result.purged_contributions_count,
      recalculated_issues_count: result.recalculated_issues_count,
      device_hash: result.device_hash,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erro em POST /api/admin/purge-device:', message);
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: 'Erro ao executar expurgo do dispositivo.' });
  }
});
