/**
 * src/shared/types.ts
 *
 * Tipagem Completa e Consistente do Domínio para o Taiada Fiscaliza ("Cobra, Taiada!").
 * Compartilhado entre Frontend (React), Backend (Express) e Camada de Persistência (SQLite).
 */

// ==========================================
// 1. Tipos Literais e Enums do Domínio
// ==========================================

export type IssueCategory =
  | 'buracos_vias'
  | 'iluminacao'
  | 'limpeza_mato'
  | 'calcadas_acessibilidade'
  | 'sinalizacao_transito'
  | 'saude'
  | 'educacao'
  | 'transporte';

export type IssueSeverity = 1 | 2 | 3 | 4 | 5;

export type LocationSource =
  | 'gps_live'
  | 'photo_exif'
  | 'search_address'
  | 'manual_pin';

export type ModerationStatus =
  | 'auto_approved'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type ResolutionStatus =
  | 'open'
  | 'verifying_resolution'
  | 'resolved_community'
  | 'reopened'
  | 'resolved_official';

export type OfficialStatus =
  | 'received'
  | 'triaged'
  | 'protocolled'
  | 'completed';

export type VoteType =
  | 'upvote'
  | 'resolved_yes'
  | 'resolved_no_returned';

export type TimelineEventType =
  | 'created'
  | 'merged_support'
  | 'waze_verifying'
  | 'waze_resolved'
  | 'waze_reopened'
  | 'official_protocol'
  | 'moderated';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';

export type ViewMode = 'map' | 'list';

// ==========================================
// 2. Estrutura de Dados Auxiliares Condicionais
// ==========================================

export interface IssueAuxiliaryData {
  pole_number?: string; // Categoria iluminacao
  health_unit?: string; // Categoria saude
  approx_time?: string; // Categoria saude
  school_name?: string; // Categoria educacao
  bus_line?: string; // Categoria transporte
  stop_reference?: string; // Categoria transporte
  [key: string]: unknown;
}

// ==========================================
// 3. Entidades Centrais (Tabelas do Banco SQLite)
// ==========================================

/**
 * Representação completa da tabela 'issues' (31 campos conforme schema DDL).
 */
export interface Issue {
  id: string; // Ex: 'TAI-2026-0101'
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;

  // Dados auxiliares em JSON puro no banco
  auxiliary_data: string | null;
  parsed_auxiliary_data?: IssueAuxiliaryData;

  // Localização bruta original vs ajustada
  raw_latitude: number | null;
  raw_longitude: number | null;
  latitude: number;
  longitude: number;
  street_name: string;
  street_group_key: string; // Ex: 'avenida-brasil::buracos_vias'
  neighborhood: string;
  reference_point: string | null;
  location_source: LocationSource;
  gps_accuracy_meters: number | null;

  // Metadados de Auditoria EXIF da Imagem
  photo_url: string | null; // Caminho público .webp sanitizado
  exif_captured_at: string | null; // ISO 8601
  exif_latitude: number | null;
  exif_longitude: number | null;
  exif_distance_meters: number | null;
  exif_verified_local: number; // 0 ou 1 (<= 250m em Caçapava)

  // Autor e Defesa Anti-Spam Zero-Auth
  author_name: string | null;
  device_hash: string;
  trust_score: number;
  moderation_status: ModerationStatus;
  is_shadowbanned: number; // 0 ou 1

  // Status de Resolução e Gabinete Oficial
  resolution_status: ResolutionStatus;
  official_status: OfficialStatus;
  official_protocol_number: string | null;

  // Contadores e Saldo Waze
  upvotes_count: number;
  consensus_score: number;
  reopened_count: number;

  created_at: number; // Timestamp Unix epoch em milissegundos
  updated_at: number; // Timestamp Unix epoch em milissegundos
}

/**
 * Representação da tabela 'issue_votes' (Votação Comunitária Waze).
 */
export interface IssueVote {
  id: number;
  issue_id: string;
  device_hash: string;
  vote_type: VoteType;
  voter_latitude: number | null;
  voter_longitude: number | null;
  distance_to_issue_meters: number | null;
  is_presential_gps: number; // 1 se distance <= 150m
  has_proof_photo: number; // 1 se foto anexada
  proof_photo_url: string | null;
  vote_weight: number; // 5.0 (GPS+Foto), 3.0 (GPS), 0.5 (Remoto)
  note: string | null;
  is_shadowbanned: number; // 0 ou 1
  created_at: number;
}

/**
 * Representação da tabela 'issue_contributions' (Fusão de Raio Curto <= 40m - Opção A).
 */
export interface IssueContribution {
  id: number;
  issue_id: string;
  device_hash: string;
  author_name: string | null;
  note: string | null;
  photo_url: string | null;
  exif_captured_at: string | null;
  exif_verified_local: number; // 0 ou 1
  is_shadowbanned: number; // 0 ou 1
  created_at: number;
}

/**
 * Representação da tabela 'issue_timeline' (Linha do Tempo Auditável).
 */
export interface IssueTimelineEvent {
  id: number;
  issue_id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  created_at: number;
}

/**
 * Representação da tabela 'blocked_devices' (Dispositivos Banidos / Shadowban).
 */
export interface BlockedDevice {
  device_hash: string;
  reason: string | null;
  shadowban: number; // 1 para shadowban, 0 para bloqueio direto
  created_at: number;
}

// ==========================================
// 4. Estruturas Agregadas e Dossiês de Rua
// ==========================================

export interface StreetDossierPoint {
  point_number: number; // 1, 2, 3...
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  severity: IssueSeverity;
  upvotes_count: number;
  photo_url: string | null;
  created_at: number;
}

export interface StreetDossier {
  street_group_key: string;
  street_name: string;
  category: IssueCategory;
  category_label: string;
  issues_count: number;
  total_upvotes: number;
  points: StreetDossierPoint[];
  center_latitude: number;
  center_longitude: number;
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
}

export interface GlobalStats {
  total_issues: number;
  resolved_issues: number;
  total_upvotes: number;
  active_dossiers: number;
}

// ==========================================
// 5. Contratos de Requisição e Resposta (DTOs)
// ==========================================

export interface CheckDuplicatesDTO {
  latitude: number;
  longitude: number;
  category: IssueCategory;
  street_name?: string;
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  distance_meters: number;
  upvotes_count: number;
  photo_url: string | null;
  created_at: number;
}

export interface CheckDuplicatesResponse {
  has_nearby_duplicate: boolean;
  duplicate_issue: DuplicateCandidate | null;
  nearby_duplicates: DuplicateCandidate[];
  same_street_issues: DuplicateCandidate[];
}

export interface CreateIssueDTO {
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  auxiliary_data?: IssueAuxiliaryData;
  raw_latitude?: number;
  raw_longitude?: number;
  latitude: number;
  longitude: number;
  street_name: string;
  neighborhood: string;
  reference_point?: string;
  location_source: LocationSource;
  gps_accuracy_meters?: number;
  author_name?: string;
}

export interface ContributeIssueDTO {
  note?: string;
  author_name?: string;
}

export interface InteractIssueDTO {
  vote_type: VoteType;
  voter_latitude?: number;
  voter_longitude?: number;
  note?: string;
}

export interface ModerateIssueDTO {
  moderation_status?: ModerationStatus;
  official_status?: OfficialStatus;
  official_protocol_number?: string;
}

export interface PurgeDeviceDTO {
  device_hash: string;
  reason?: string;
}

export interface IssueDetailResponse {
  issue: Issue;
  contributions: IssueContribution[];
  timeline: IssueTimelineEvent[];
  votes_summary: {
    total_upvotes: number;
    presential_votes_count: number;
    consensus_score: number;
    reopened_count: number;
  };
}

export interface IssueListResponse {
  issues: Issue[];
  street_dossiers: StreetDossier[];
  stats: GlobalStats;
}

export interface DeviceIdentity {
  device_id: string;
  device_hash: string;
  token: string;
  is_new: boolean;
}
