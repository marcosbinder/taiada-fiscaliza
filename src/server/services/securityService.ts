/**
 * src/server/services/securityService.ts
 *
 * Camada de Segurança Zero-Auth, Identidade Anônima, trust_score e Moderação.
 * Responsabilidades:
 * 1. Emissão e verificação de cookie assinado taiada_device_token (UUIDv4 + HMAC-SHA256).
 * 2. Cálculo determinístico de device_hash com anonimização de subnet de IP.
 * 3. Validação e sanitização estrita de author_name (rejeita URLs, telefones, arrobas e termos abusivos).
 * 4. Cálculo dinâmico de trust_score (Base 70, bônus GPS/EXIF/histórico, penalidades foto/texto/flood).
 * 5. Lógica de aprovação automática (>= 60) vs fila pending_review (< 60 com Optimistic UI).
 * 6. Consulta e aplicação de Shadowban (is_shadowbanned = 1).
 * 7. Expurgo em 1 Clique (POST /api/admin/purge-device) em transação atômica 72h com recálculo de consenso.
 * 8. Disparo assíncrono de Webhook opcional (Discord/Telegram).
 */

import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { env } from '../../config/env';
import { LocationSource, ModerationStatus } from '../../shared/types';
import { recalculateIssueConsensus } from './consensusEngine';

/**
 * Sanitiza e valida o nome opcional do autor do relato.
 */
export function validateAndSanitizeAuthorName(name?: string | null): {
  valid: boolean;
  error?: string;
  cleanName: string | null;
} {
  if (!name || name.trim().length === 0) {
    return { valid: true, cleanName: null };
  }

  const clean = name.trim();

  if (clean.length > 50) {
    return {
      valid: false,
      error: 'O nome do autor deve possuir no máximo 50 caracteres.',
      cleanName: null,
    };
  }

  // 1. Bloqueio de Links, URLs e Domínios
  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(?:com|br|org|net|gov|edu|io|app|dev|xyz|info|tv)\b/i;
  if (urlRegex.test(clean)) {
    return {
      valid: false,
      error: 'O campo de identificação não pode conter links ou endereços de sites.',
      cleanName: null,
    };
  }

  // 2. Bloqueio de Telefones com DDD ou formatos celulares
  const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s.]?\d{4}/;
  if (phoneRegex.test(clean)) {
    return {
      valid: false,
      error: 'O campo de identificação não pode conter números de telefone ou WhatsApp.',
      cleanName: null,
    };
  }

  // 3. Bloqueio de Redes Sociais (@arrobas)
  const socialRegex = /(?:@\w{2,}|instagram|facebook|tiktok|twitter|kwai|youtube)/i;
  if (socialRegex.test(clean)) {
    return {
      valid: false,
      error: 'O campo de identificação não pode conter perfis de redes sociais.',
      cleanName: null,
    };
  }

  // 4. Blocklist básica de ofensas e propaganda eleitoral explícita
  const blocklist = ['prefeito ladrao', 'vereador corrupto', 'vote 1', 'vote 2', 'vote 4', 'vote 5'];
  const lower = clean.toLowerCase();
  for (const term of blocklist) {
    if (lower.includes(term)) {
      return {
        valid: false,
        error: 'O campo contém termos impróprios ou desrespeitosos.',
        cleanName: null,
      };
    }
  }

  return { valid: true, cleanName: clean };
}

/**
 * Emite token assinado taiada_device_token no formato "<uuidv4>.<hmac_sha256>".
 */
export function generateDeviceToken(
  deviceId: string = crypto.randomUUID(),
  secret: string = env.DEVICE_SECRET
): string {
  const hmac = crypto.createHmac('sha256', secret).update(deviceId).digest('hex');
  return `${deviceId}.${hmac}`;
}

/**
 * Valida o token taiada_device_token contra o secret via comparação timingSafeEqual.
 * Retorna o deviceId se válido, ou null se corrompido/inválido.
 */
export function verifyDeviceToken(
  token?: string | null,
  secret: string = env.DEVICE_SECRET
): string | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [deviceId, providedHmac] = token.split('.');
  if (!deviceId || !providedHmac || providedHmac.length !== 64) {
    return null;
  }

  const expectedHmac = crypto.createHmac('sha256', secret).update(deviceId).digest('hex');

  const providedBuf = Buffer.from(providedHmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');

  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }

  const match = crypto.timingSafeEqual(providedBuf, expectedBuf);
  return match ? deviceId : null;
}

/**
 * Anonimiza o IP do cliente para uma máscara de sub-rede (/24 para IPv4, /64 para IPv6).
 */
export function maskIpSubnet(ip: string): string {
  if (!ip || typeof ip !== 'string') return '0.0.0.0/24';

  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  // IPv4: mascara o último octeto
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
  }

  // IPv6: mascara os 4 últimos blocos
  if (cleanIp.includes(':')) {
    const parts = cleanIp.split(':');
    return `${parts.slice(0, 4).join(':')}::/64`;
  }

  return '0.0.0.0/24';
}

/**
 * Calcula o hash anônimo e persistente do dispositivo (device_hash):
 * device_hash = SHA256(deviceId + ":" + ipSubnet + ":" + secret).slice(0, 32).
 */
export function computeDeviceHash(
  deviceId: string,
  rawIp: string,
  secret: string = env.DEVICE_SECRET
): string {
  const subnet = maskIpSubnet(rawIp);
  const payload = `${deviceId}:${subnet}:${secret}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export interface TrustScoreInput {
  device_hash: string;
  location_source: LocationSource;
  gps_accuracy_meters?: number | null;
  exif_verified_local: number;
  isSuspiciousImage: boolean;
  title: string;
  description: string;
  author_name?: string | null;
}

export interface TrustScoreResult {
  trustScore: number;
  moderationStatus: ModerationStatus;
  bonusApplied: Array<{ label: string; points: number }>;
  penaltiesApplied: Array<{ label: string; points: number }>;
}

/**
 * Calcula dinamicamente o trust_score (0 a 100) com base de 70 pontos:
 * - Bônus: GPS ao vivo <= 50m (+15), EXIF verificado local (+15), histórico aprovado (+10).
 * - Penalidades: Imagem suspeita (-40), texto suspeito (-35), flood de relatos (-30).
 * Decisão: trust_score >= 60 -> auto_approved; < 60 -> pending_review (Optimistic UI).
 */
export function computeTrustScore(db: Database.Database, input: TrustScoreInput): TrustScoreResult {
  let score = 70;
  const bonusApplied: Array<{ label: string; points: number }> = [];
  const penaltiesApplied: Array<{ label: string; points: number }> = [];

  // Bônus 1: Coordenada obtida via GPS ao vivo com precisão <= 50m
  if (
    input.location_source === 'gps_live' &&
    typeof input.gps_accuracy_meters === 'number' &&
    input.gps_accuracy_meters <= 50
  ) {
    score += 15;
    bonusApplied.push({ label: 'GPS ao vivo de alta precisão (<= 50m)', points: 15 });
  }

  // Bônus 2: Foto auditada e verificada no local via EXIF (<= 250m)
  if (input.exif_verified_local === 1) {
    score += 15;
    bonusApplied.push({ label: 'Foto com metadados EXIF verificados no local', points: 15 });
  }

  // Bônus 3: Histórico de confiança do dispositivo (já possui relatos aprovados anteriormente)
  const historyRow = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM issues
       WHERE device_hash = ?
         AND moderation_status IN ('auto_approved', 'approved')
         AND is_shadowbanned = 0`
    )
    .get(input.device_hash) as { count: number };

  if (historyRow && historyRow.count >= 1) {
    score += 10;
    bonusApplied.push({ label: 'Dispositivo com histórico de relatos aprovados', points: 10 });
  }

  // Penalidade 1: Imagem sinalizada pela heurística de qualidade
  if (input.isSuspiciousImage) {
    score -= 40;
    penaltiesApplied.push({ label: 'Imagem sinalizada por baixa qualidade ou anomalia', points: -40 });
  }

  // Penalidade 2: Texto suspeito (caixa alta excessiva > 60% ou caracteres repetidos)
  const combinedText = `${input.title} ${input.description}`;
  const lettersOnly = combinedText.replace(/[^a-zA-ZáéíóúÁÉÍÓÚçÇ]/g, '');
  const uppercaseLetters = combinedText.replace(/[^A-ZÁÉÍÓÚÇ]/g, '');

  const hasExcessiveCaps =
    lettersOnly.length > 10 && uppercaseLetters.length / lettersOnly.length > 0.6;
  const hasRepeatedChars = /(.)\1{4,}/.test(combinedText);

  if (hasExcessiveCaps || hasRepeatedChars) {
    score -= 35;
    penaltiesApplied.push({
      label: 'Texto com formatação suspeita, caixa alta excessiva ou repetições',
      points: -35,
    });
  }

  // Penalidade 3: Flood (tentativa de criar 3 ou mais relatos em menos de 30 minutos)
  const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
  const recentReports = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM issues
       WHERE device_hash = ?
         AND created_at >= ?`
    )
    .get(input.device_hash, thirtyMinsAgo) as { count: number };

  if (recentReports && recentReports.count >= 2) {
    score -= 30;
    penaltiesApplied.push({
      label: 'Múltiplos relatos criados em curto intervalo de tempo (flood)',
      points: -30,
    });
  }

  // Clamping em [0, 100]
  const finalScore = Math.max(0, Math.min(100, score));
  const moderationStatus: ModerationStatus = finalScore >= 60 ? 'auto_approved' : 'pending_review';

  return {
    trustScore: finalScore,
    moderationStatus,
    bonusApplied,
    penaltiesApplied,
  };
}

/**
 * Verifica se um dispositivo está em modo Shadowban.
 */
export function isDeviceShadowbanned(db: Database.Database, device_hash: string): boolean {
  const row = db
    .prepare('SELECT shadowban FROM blocked_devices WHERE device_hash = ?')
    .get(device_hash) as { shadowban: number } | undefined;

  return row ? row.shadowban === 1 : false;
}

export interface PurgeParams {
  device_hash: string;
  reason?: string;
  mode?: 'purge_and_shadowban' | 'shadowban_only';
}

export interface PurgeResult {
  device_hash: string;
  purged_issues_count: number;
  purged_votes_count: number;
  purged_contributions_count: number;
  recalculated_issues_count: number;
  shadowbanned: boolean;
}

/**
 * Expurgo em 1 Clique (POST /api/admin/purge-device).
 * Executado em transação atômica estrita:
 * 1. Insere ou atualiza o dispositivo em blocked_devices (shadowban = 1).
 * 2. Remove relatos, votos e contribuições criados nas últimas 72 horas por aquele device_hash.
 * 3. Identifica todos os chamados afetados por votos do infrator e recalcula pontuações e status.
 */
export function purgeDevice(db: Database.Database, params: PurgeParams): PurgeResult {
  const mode = params.mode || 'purge_and_shadowban';
  const now = Date.now();
  const seventyTwoHoursAgo = now - 72 * 3600 * 1000;

  const runPurgeTransaction = db.transaction(() => {
    // 1. Cadastra/atualiza em blocked_devices
    db.prepare(
      `INSERT INTO blocked_devices (device_hash, reason, shadowban, created_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(device_hash) DO UPDATE SET
         shadowban = 1,
         reason = excluded.reason`
    ).run(params.device_hash, params.reason || 'Expurgo de troll pelo painel administrativo', now);

    if (mode === 'shadowban_only') {
      return {
        device_hash: params.device_hash,
        purged_issues_count: 0,
        purged_votes_count: 0,
        purged_contributions_count: 0,
        recalculated_issues_count: 0,
        shadowbanned: true,
      };
    }

    // 2. Coleta os chamados afetados pelos votos do infrator antes de deletar
    const affectedVotes = db
      .prepare(
        `SELECT DISTINCT issue_id
         FROM issue_votes
         WHERE device_hash = ?
           AND created_at >= ?`
      )
      .all(params.device_hash, seventyTwoHoursAgo) as Array<{ issue_id: string }>;

    // 3. Expurga votos do infrator nas últimas 72 horas
    const deleteVotesResult = db
      .prepare(
        `DELETE FROM issue_votes
         WHERE device_hash = ?
           AND created_at >= ?`
      )
      .run(params.device_hash, seventyTwoHoursAgo);

    // 4. Expurga contribuições anexadas pelo infrator nas últimas 72 horas
    const deleteContribResult = db
      .prepare(
        `DELETE FROM issue_contributions
         WHERE device_hash = ?
           AND created_at >= ?`
      )
      .run(params.device_hash, seventyTwoHoursAgo);

    // 5. Expurga chamados criados pelo infrator nas últimas 72 horas (cascade deleta dependências)
    const ownIssues = db
      .prepare(
        `SELECT id
         FROM issues
         WHERE device_hash = ?
           AND created_at >= ?`
      )
      .all(params.device_hash, seventyTwoHoursAgo) as Array<{ id: string }>;

    const ownIssueIds = new Set(ownIssues.map((i) => i.id));

    const deleteIssuesResult = db
      .prepare(
        `DELETE FROM issues
         WHERE device_hash = ?
           AND created_at >= ?`
      )
      .run(params.device_hash, seventyTwoHoursAgo);

    // 6. Recalcula o consenso e upvotes de todos os chamados restantes afetados
    let recalculatedCount = 0;
    for (const item of affectedVotes) {
      // Ignora chamados que foram deletados no passo anterior
      if (ownIssueIds.has(item.issue_id)) continue;

      // Atualiza upvotes_count
      const upvotesRow = db
        .prepare(
          `SELECT COUNT(*) as count
           FROM issue_votes
           WHERE issue_id = ?
             AND vote_type = 'upvote'
             AND is_shadowbanned = 0`
        )
        .get(item.issue_id) as { count: number };

      db.prepare('UPDATE issues SET upvotes_count = ? WHERE id = ?').run(
        upvotesRow?.count || 1,
        item.issue_id
      );

      // Recalcula score de resolução Waze
      try {
        recalculateIssueConsensus(db, item.issue_id, now);
        recalculatedCount++;
      } catch {
        // Chamado pode ter sido excluído paralelamente
      }
    }

    return {
      device_hash: params.device_hash,
      purged_issues_count: deleteIssuesResult.changes,
      purged_votes_count: deleteVotesResult.changes,
      purged_contributions_count: deleteContribResult.changes,
      recalculated_issues_count: recalculatedCount,
      shadowbanned: true,
    };
  });

  return runPurgeTransaction();
}

/**
 * Disparo assíncrono não bloqueante de Webhook opcional (Discord/Telegram).
 */
export async function dispatchWebhookAlert(event: {
  type: string;
  title: string;
  description: string;
  issueId: string;
  category?: string;
  severity?: number;
  url?: string;
}): Promise<void> {
  if (!env.WEBHOOK_URL) return;

  try {
    const payload = {
      content: `📢 **[Taiada Fiscaliza • Alerta Cívico]**\n**${event.title}** (Protocolo: \`${event.issueId}\`)\n${event.description}\n${event.url ? `Acesse: ${event.url}` : ''}`,
    };

    await fetch(env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000), // Timeout de 5s para não prender threads
    });
  } catch (err: unknown) {
    // Falha silenciosa: webhooks de terceiros nunca podem quebrar o fluxo do usuário
    console.warn('⚠️ [WEBHOOK ERROR]: Falha ao disparar alerta cívico:', err);
  }
}
