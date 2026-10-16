/**
 * src/server/services/geoService.ts
 *
 * Motor de Inteligência Geoespacial para Caçapava - SP (IBGE 3508504).
 * Responsabilidades:
 * 1. Validação de Geofencing Estrito (Trava Municipal com erro 422 OUTSIDE_CACAPAVA).
 * 2. Deduplicação Nível 1 (Raio <= 40m via Haversine para a mesma categoria).
 * 3. Identificação de chamados ativos na mesma via (same_street_issues).
 * 4. Agregação Automática de Dossiês de Rua (Nível 2 via street_group_key com >= 2 chamados).
 */

import type Database from 'better-sqlite3';
import {
  isWithinCacapava,
  haversineDistanceMeters,
  buildStreetGroupKey,
  DUPLICATE_RADIUS_METERS,
} from '../../shared/geo';
import {
  IssueCategory,
  CheckDuplicatesDTO,
  CheckDuplicatesResponse,
  DuplicateCandidate,
  StreetDossier,
  StreetDossierPoint,
} from '../../shared/types';
import { CATEGORY_MAP } from '../../shared/categories';

/**
 * Erro customizado disparado quando coordenadas estão fora de Caçapava - SP.
 */
export class GeofenceError extends Error {
  public readonly code = 'OUTSIDE_CACAPAVA';
  public readonly statusCode = 422;

  constructor(
    message = 'O Taiada Fiscaliza atende exclusivamente o município de Caçapava - SP. A coordenada informada está fora do perímetro municipal.'
  ) {
    super(message);
    this.name = 'GeofenceError';
  }
}

/**
 * Valida se uma coordenada pertence ao perímetro de Caçapava.
 * Lança GeofenceError (422) se estiver fora.
 */
export function checkGeofence(latitude: number, longitude: number): void {
  if (!isWithinCacapava(latitude, longitude)) {
    throw new GeofenceError();
  }
}

/**
 * Busca duplicatas em dois níveis:
 * - Nível 1: Chamados ativos da mesma categoria a <= 40m (nearby_duplicates).
 * - Complementar: Chamados ativos na mesma via e categoria além dos 40m (same_street_issues).
 */
export function findDuplicates(
  db: Database.Database,
  params: CheckDuplicatesDTO
): CheckDuplicatesResponse {
  // 1. Validação mandatória de Geofence
  checkGeofence(params.latitude, params.longitude);

  // 2. Busca de chamados ativos da mesma categoria no banco
  const stmtActiveCategory = db.prepare(`
    SELECT
      id,
      title,
      category,
      severity,
      latitude,
      longitude,
      street_name,
      street_group_key,
      upvotes_count,
      photo_url,
      created_at
    FROM issues
    WHERE category = ?
      AND resolution_status NOT IN ('resolved_community', 'resolved_official')
      AND moderation_status IN ('auto_approved', 'approved')
      AND is_shadowbanned = 0
  `);

  const categoryIssues = stmtActiveCategory.all(params.category) as Array<{
    id: string;
    title: string;
    category: IssueCategory;
    severity: number;
    latitude: number;
    longitude: number;
    street_name: string;
    street_group_key: string;
    upvotes_count: number;
    photo_url: string | null;
    created_at: number;
  }>;

  const nearbyDuplicates: DuplicateCandidate[] = [];
  const nearbyIds = new Set<string>();

  for (const issue of categoryIssues) {
    const dist = haversineDistanceMeters(
      params.latitude,
      params.longitude,
      issue.latitude,
      issue.longitude
    );

    if (dist <= DUPLICATE_RADIUS_METERS) {
      nearbyDuplicates.push({
        id: issue.id,
        title: issue.title,
        category: issue.category,
        severity: issue.severity as 1 | 2 | 3 | 4 | 5,
        distance_meters: Math.round(dist * 10) / 10,
        upvotes_count: issue.upvotes_count,
        photo_url: issue.photo_url,
        created_at: issue.created_at,
      });
      nearbyIds.add(issue.id);
    }
  }

  // Ordena duplicatas mais próximas primeiro
  nearbyDuplicates.sort((a, b) => a.distance_meters - b.distance_meters);

  // 3. Busca de chamados na mesma via (se street_name foi informado)
  const sameStreetIssues: DuplicateCandidate[] = [];

  if (params.street_name && params.street_name.trim().length > 0) {
    const targetKey = buildStreetGroupKey(params.street_name, params.category);

    for (const issue of categoryIssues) {
      // Ignora os que já entraram como duplicata de raio curto
      if (nearbyIds.has(issue.id)) continue;

      if (issue.street_group_key === targetKey) {
        const dist = haversineDistanceMeters(
          params.latitude,
          params.longitude,
          issue.latitude,
          issue.longitude
        );

        sameStreetIssues.push({
          id: issue.id,
          title: issue.title,
          category: issue.category,
          severity: issue.severity as 1 | 2 | 3 | 4 | 5,
          distance_meters: Math.round(dist * 10) / 10,
          upvotes_count: issue.upvotes_count,
          photo_url: issue.photo_url,
          created_at: issue.created_at,
        });
      }
    }

    // Ordena pela menor distância
    sameStreetIssues.sort((a, b) => a.distance_meters - b.distance_meters);
  }

  return {
    has_nearby_duplicate: nearbyDuplicates.length > 0,
    duplicate_issue: nearbyDuplicates.length > 0 ? nearbyDuplicates[0] : null,
    nearby_duplicates: nearbyDuplicates,
    same_street_issues: sameStreetIssues,
  };
}

/**
 * Agrega chamados ativos em Dossiês Mestres de Rua (Nível 2).
 * Um Dossiê é formado quando existem >= 2 chamados ativos com a mesma street_group_key.
 */
export function aggregateStreetDossiers(
  db: Database.Database,
  categoryFilter?: IssueCategory
): StreetDossier[] {
  let query = `
    SELECT
      id,
      title,
      category,
      severity,
      latitude,
      longitude,
      street_name,
      street_group_key,
      neighborhood,
      upvotes_count,
      photo_url,
      created_at
    FROM issues
    WHERE resolution_status NOT IN ('resolved_community', 'resolved_official')
      AND moderation_status IN ('auto_approved', 'approved')
      AND is_shadowbanned = 0
  `;

  const queryParams: any[] = [];
  if (categoryFilter) {
    query += ' AND category = ?';
    queryParams.push(categoryFilter);
  }

  const rows = db.prepare(query).all(...queryParams) as Array<{
    id: string;
    title: string;
    category: IssueCategory;
    severity: number;
    latitude: number;
    longitude: number;
    street_name: string;
    street_group_key: string;
    neighborhood: string;
    upvotes_count: number;
    photo_url: string | null;
    created_at: number;
  }>;

  // Agrupa os chamados pela chave street_group_key
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!groups.has(row.street_group_key)) {
      groups.set(row.street_group_key, []);
    }
    groups.get(row.street_group_key)!.push(row);
  }

  const dossiers: StreetDossier[] = [];

  for (const [groupKey, groupRows] of groups.entries()) {
    // Exige no mínimo 2 chamados ativos na mesma via/categoria para formar Dossiê
    if (groupRows.length < 2) continue;

    // Busca contribuições adicionais associadas a esses chamados para a soma total de munícipes
    const issueIds = groupRows.map((r) => r.id);
    const placeholders = issueIds.map(() => '?').join(',');
    const contribRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM issue_contributions WHERE issue_id IN (${placeholders}) AND is_shadowbanned = 0`
      )
      .get(...issueIds) as { count: number };

    const totalContributions = contribRow?.count || 0;
    const totalIssueUpvotes = groupRows.reduce((acc, curr) => acc + curr.upvotes_count, 0);
    const totalSupporters = totalIssueUpvotes + totalContributions;

    // Ordenação geográfica das demandas ao longo da via para numeração sequencial (#1, #2, #3...)
    const sortedPoints = [...groupRows].sort((a, b) => {
      if (Math.abs(a.latitude - b.latitude) > 0.0001) {
        return a.latitude - b.latitude;
      }
      return a.longitude - b.longitude;
    });

    const lats = groupRows.map((r) => r.latitude);
    const lngs = groupRows.map((r) => r.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const firstItem = groupRows[0];
    const categoryDef = CATEGORY_MAP[firstItem.category];
    const categoryLabel = categoryDef ? categoryDef.label : 'Zeladoria Geral';

    const points: StreetDossierPoint[] = sortedPoints.map((pt, idx) => ({
      point_number: idx + 1,
      id: pt.id,
      title: pt.title,
      latitude: pt.latitude,
      longitude: pt.longitude,
      severity: pt.severity as 1 | 2 | 3 | 4 | 5,
      upvotes_count: pt.upvotes_count,
      photo_url: pt.photo_url,
      created_at: pt.created_at,
    }));

    dossiers.push({
      street_group_key: groupKey,
      street_name: firstItem.street_name,
      category: firstItem.category,
      category_label: categoryLabel,
      issues_count: groupRows.length,
      total_upvotes: totalSupporters,
      points,
      center_latitude: Math.round(((minLat + maxLat) / 2) * 1000000) / 1000000,
      center_longitude: Math.round(((minLng + maxLng) / 2) * 1000000) / 1000000,
      min_latitude: minLat,
      max_latitude: maxLat,
      min_longitude: minLng,
      max_longitude: maxLng,
    });
  }

  // Ordena os Dossiês pelo total de moradores afetados (maior impacto comunitário primeiro)
  dossiers.sort((a, b) => {
    if (b.total_upvotes !== a.total_upvotes) {
      return b.total_upvotes - a.total_upvotes;
    }
    return b.issues_count - a.issues_count;
  });

  return dossiers;
}
