/**
 * src/server/services/consensusEngine.ts
 *
 * Motor de Consenso Comunitário Estilo Waze com Decaimento Temporal Exponencial e Prova GPS.
 * Responsabilidades:
 * 1. Ponderação de Votos:
 *    - Presencial (d <= 150m) com Foto: 5.0 pontos
 *    - Presencial (d <= 150m) sem Foto: 3.0 pontos
 *    - Remoto (d > 150m ou sem GPS): 0.5 ponto (com trava de teto remoto [-3.0, +3.0]).
 * 2. Decaimento Temporal:
 *    - Fator (0.75)^dias sobre o timestamp original de cada voto.
 * 3. Máquina de Estados:
 *    - open: S < 4.0
 *    - verifying_resolution: 4.0 <= S < 10.0 (ou S >= 10.0 com < 2 aparelhos presenciais distintos)
 *    - resolved_community: S >= 10.0 E >= 2 votos presenciais positivos de aparelhos distintos
 *    - reopened: Reabre automaticamente se S < 4.0 ou acumular <= -6.0 pontos em 72h após verificação/resolução.
 * 4. Recálculo Atômico de Consenso no SQLite.
 */

import type Database from 'better-sqlite3';
import { haversineDistanceMeters, PRESENTIAL_RADIUS_METERS } from '../../shared/geo';
import {
  IssueVote,
  ResolutionStatus,
  TimelineEventType,
  VoteType,
} from '../../shared/types';

export const WEIGHT_PRESENTIAL_PHOTO = 5.0;
export const WEIGHT_PRESENTIAL_NO_PHOTO = 3.0;
export const WEIGHT_REMOTE = 0.5;
export const REMOTE_CEILING = 3.0;
export const TIME_DECAY_BASE = 0.75;

export const THRESHOLD_OPEN_MAX = 4.0;
export const THRESHOLD_RESOLVED_MIN = 10.0;
export const THRESHOLD_REOPEN_NEGATIVE_72H = -6.0;
export const MIN_DISTINCT_PRESENTIAL_DEVICES = 2;

export interface VoteWeightAnalysis {
  vote_weight: number;
  is_presential_gps: number;
  distance_to_issue_meters: number | null;
}

/**
 * Calcula o peso do voto baseado na presença física por coordenadas GPS e anexação de foto.
 */
export function computeVoteWeight(params: {
  voter_latitude?: number | null;
  voter_longitude?: number | null;
  has_proof_photo?: boolean;
  issue_latitude: number;
  issue_longitude: number;
}): VoteWeightAnalysis {
  if (
    typeof params.voter_latitude === 'number' &&
    typeof params.voter_longitude === 'number' &&
    !isNaN(params.voter_latitude) &&
    !isNaN(params.voter_longitude)
  ) {
    const dist = haversineDistanceMeters(
      params.voter_latitude,
      params.voter_longitude,
      params.issue_latitude,
      params.issue_longitude
    );

    if (dist <= PRESENTIAL_RADIUS_METERS) {
      return {
        vote_weight: params.has_proof_photo ? WEIGHT_PRESENTIAL_PHOTO : WEIGHT_PRESENTIAL_NO_PHOTO,
        is_presential_gps: 1,
        distance_to_issue_meters: dist,
      };
    }

    return {
      vote_weight: WEIGHT_REMOTE,
      is_presential_gps: 0,
      distance_to_issue_meters: dist,
    };
  }

  // Voto emitido sem permissão de geolocalização no navegador
  return {
    vote_weight: WEIGHT_REMOTE,
    is_presential_gps: 0,
    distance_to_issue_meters: null,
  };
}

export interface ConsensusScoreResult {
  consensus_score: number;
  distinct_positive_presential_devices: number;
  recent_negative_points_72h: number;
  presential_score: number;
  remote_score_clamped: number;
  total_valid_votes: number;
}

/**
 * Calcula a pontuação agregada de validação com decaimento temporal e teto remoto.
 */
export function calculateConsensusScore(
  votes: Array<
    Pick<
      IssueVote,
      'device_hash' | 'vote_type' | 'vote_weight' | 'is_presential_gps' | 'is_shadowbanned' | 'created_at'
    >
  >,
  nowTimestamp = Date.now()
): ConsensusScoreResult {
  // Filtra votos de dispositivos em shadowban e considera votos de resolução
  const validVotes = votes.filter(
    (v) => v.is_shadowbanned === 0 && (v.vote_type === 'resolved_yes' || v.vote_type === 'resolved_no_returned')
  );

  const MS_PER_DAY = 86_400_000;
  const MS_72H = 72 * 3600 * 1000;

  let presentialSum = 0;
  let remoteSum = 0;
  let recentNegative72h = 0;
  const positivePresentialDevices = new Set<string>();

  for (const vote of validVotes) {
    const deltaDays = Math.max(0, (nowTimestamp - vote.created_at) / MS_PER_DAY);
    const decay = Math.pow(TIME_DECAY_BASE, deltaDays);
    const direction = vote.vote_type === 'resolved_yes' ? 1.0 : -1.0;

    if (vote.is_presential_gps === 1) {
      presentialSum += direction * vote.vote_weight * decay;
      if (vote.vote_type === 'resolved_yes') {
        positivePresentialDevices.add(vote.device_hash);
      }
    } else {
      remoteSum += direction * WEIGHT_REMOTE * decay;
    }

    // Monitora contestação negativa recente (últimas 72 horas) para gatilho de reabertura
    if (vote.vote_type === 'resolved_no_returned' && nowTimestamp - vote.created_at <= MS_72H) {
      recentNegative72h += -1.0 * vote.vote_weight * decay;
    }
  }

  // Trava rígida de teto remoto em [-3.0, +3.0]
  const remoteClamped = Math.max(-REMOTE_CEILING, Math.min(REMOTE_CEILING, remoteSum));
  const finalScore = Math.round((presentialSum + remoteClamped) * 10) / 10;

  return {
    consensus_score: finalScore,
    distinct_positive_presential_devices: positivePresentialDevices.size,
    recent_negative_points_72h: Math.round(recentNegative72h * 10) / 10,
    presential_score: Math.round(presentialSum * 10) / 10,
    remote_score_clamped: Math.round(remoteClamped * 10) / 10,
    total_valid_votes: validVotes.length,
  };
}

export interface StateTransitionResult {
  nextStatus: ResolutionStatus;
  eventToEmit?: TimelineEventType;
  eventTitle?: string;
  eventDescription?: string;
  shouldIncrementReopenedCount: boolean;
  reason: string;
}

/**
 * Avalia as transições da máquina de estados Waze comunitária.
 */
export function evaluateResolutionState(
  currentStatus: ResolutionStatus,
  consensusScore: number,
  distinctPresentialPositiveDevices: number,
  recentNegative72h: number,
  reopenedCount: number
): StateTransitionResult {
  // Chamados com resolução oficial da Prefeitura ou Câmara permanecem protegidos
  if (currentStatus === 'resolved_official') {
    return {
      nextStatus: 'resolved_official',
      shouldIncrementReopenedCount: false,
      reason: 'Demanda com conclusão oficial registrada no gabinete da Prefeitura/Câmara.',
    };
  }

  // Regra de Reabertura (reopened):
  // Se já esteve em verificação, foi dado como resolvido ou já foi reaberto anteriormente
  const isCandidateForReopen =
    currentStatus === 'verifying_resolution' ||
    currentStatus === 'resolved_community' ||
    reopenedCount > 0 ||
    currentStatus === 'reopened';

  if (isCandidateForReopen && (consensusScore < THRESHOLD_OPEN_MAX || recentNegative72h <= THRESHOLD_REOPEN_NEGATIVE_72H)) {
    if (currentStatus !== 'reopened') {
      return {
        nextStatus: 'reopened',
        eventToEmit: 'waze_reopened',
        eventTitle: 'Demanda Reaberta por Moradores',
        eventDescription:
          'Moradores contestaram a resolução no local e relataram que o problema persiste ou reapareceu após os reparos.',
        shouldIncrementReopenedCount: true,
        reason: 'Consenso caiu abaixo de 4.0 ou acumulou <= -6.0 pontos negativos nas últimas 72h.',
      };
    }
    return {
      nextStatus: 'reopened',
      shouldIncrementReopenedCount: false,
      reason: 'Demanda permanece em estado reaberto aguardando nova intervenção.',
    };
  }

  // Regra de Resolução Comunitária (resolved_community):
  // Exige S >= 10.0 E no mínimo 2 dispositivos presenciais positivos distintos
  if (consensusScore >= THRESHOLD_RESOLVED_MIN && distinctPresentialPositiveDevices >= MIN_DISTINCT_PRESENTIAL_DEVICES) {
    if (currentStatus !== 'resolved_community') {
      return {
        nextStatus: 'resolved_community',
        eventToEmit: 'waze_resolved',
        eventTitle: 'Resolvido Segundo Moradores',
        eventDescription:
          'A comunidade confirmou no local a resolução satisfatória do problema com múltiplos validadores presenciais.',
        shouldIncrementReopenedCount: false,
        reason: 'Consenso comunitário atingido (S >= 10.0 com >= 2 aparelhos presenciais distintos).',
      };
    }
    return {
      nextStatus: 'resolved_community',
      shouldIncrementReopenedCount: false,
      reason: 'Demanda permanece resolvida segundo os moradores.',
    };
  }

  // Regra de Em Verificação (verifying_resolution):
  // Se S >= 4.0 (ou se S >= 10.0 mas ainda aguarda o segundo munícipe presencial)
  if (consensusScore >= THRESHOLD_OPEN_MAX) {
    if (currentStatus !== 'verifying_resolution') {
      return {
        nextStatus: 'verifying_resolution',
        eventToEmit: 'waze_verifying',
        eventTitle: 'Em Verificação Comunitária',
        eventDescription:
          'Moradores relataram início ou conclusão de serviços; aguardando confirmação de outros cidadãos no local.',
        shouldIncrementReopenedCount: false,
        reason: 'Pontuação positiva alcançou o limiar de verificação (4.0 <= S < 10.0 ou aguardando segundo validador).',
      };
    }
    return {
      nextStatus: 'verifying_resolution',
      shouldIncrementReopenedCount: false,
      reason: 'Demanda permanece em verificação comunitária.',
    };
  }

  // Estado padrão Aberto
  if (currentStatus === 'reopened') {
    return {
      nextStatus: 'reopened',
      shouldIncrementReopenedCount: false,
      reason: 'Demanda reaberta aguardando novos apoios e resolução.',
    };
  }

  return {
    nextStatus: 'open',
    shouldIncrementReopenedCount: false,
    reason: 'Demanda aberta no mapa aguardando resolução.',
  };
}

export interface ConsensusUpdateResult {
  updatedStatus: ResolutionStatus;
  updatedScore: number;
  statusChanged: boolean;
  reopenedCount: number;
}

/**
 * Recalcula o consenso comunitário de uma demanda no SQLite, atualizando status, score e timeline.
 */
export function recalculateIssueConsensus(
  db: Database.Database,
  issueId: string,
  nowTimestamp = Date.now()
): ConsensusUpdateResult {
  const issue = db
    .prepare('SELECT id, resolution_status, consensus_score, reopened_count FROM issues WHERE id = ?')
    .get(issueId) as
    | {
        id: string;
        resolution_status: ResolutionStatus;
        consensus_score: number;
        reopened_count: number;
      }
    | undefined;

  if (!issue) {
    throw new Error(`Chamado com ID "${issueId}" não encontrado.`);
  }

  const votes = db
    .prepare(
      `SELECT device_hash, vote_type, vote_weight, is_presential_gps, is_shadowbanned, created_at
       FROM issue_votes
       WHERE issue_id = ?`
    )
    .all(issueId) as Array<{
    device_hash: string;
    vote_type: VoteType;
    vote_weight: number;
    is_presential_gps: number;
    is_shadowbanned: number;
    created_at: number;
  }>;

  const scoreResult = calculateConsensusScore(votes, nowTimestamp);
  const transition = evaluateResolutionState(
    issue.resolution_status,
    scoreResult.consensus_score,
    scoreResult.distinct_positive_presential_devices,
    scoreResult.recent_negative_points_72h,
    issue.reopened_count
  );

  const statusChanged = transition.nextStatus !== issue.resolution_status;
  const newReopenedCount = transition.shouldIncrementReopenedCount
    ? issue.reopened_count + 1
    : issue.reopened_count;

  if (statusChanged || scoreResult.consensus_score !== issue.consensus_score) {
    db.prepare(
      `UPDATE issues
       SET consensus_score = ?,
           resolution_status = ?,
           reopened_count = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(scoreResult.consensus_score, transition.nextStatus, newReopenedCount, nowTimestamp, issueId);

    if (statusChanged && transition.eventToEmit) {
      db.prepare(
        `INSERT INTO issue_timeline (issue_id, event_type, title, description, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        issueId,
        transition.eventToEmit,
        transition.eventTitle || 'Atualização de Status',
        transition.eventDescription || null,
        nowTimestamp
      );
    }
  }

  return {
    updatedStatus: transition.nextStatus,
    updatedScore: scoreResult.consensus_score,
    statusChanged,
    reopenedCount: newReopenedCount,
  };
}
