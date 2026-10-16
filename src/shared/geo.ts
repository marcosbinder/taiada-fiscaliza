/**
 * src/shared/geo.ts
 *
 * Motor Geoespacial Municipal de Caçapava - SP (Código IBGE: 3508504).
 * Funções de Validação de Geofencing, Cálculo Geodésico Haversine,
 * Normalização de street_group_key para Dossiês de Rua e Catálogo de Vias Locais.
 */

// ==========================================
// 1. Constantes e Delimitação Geográfica
// ==========================================

export const CACAPAVA_BOUNDS = {
  minLat: -23.2600,
  maxLat: -22.9500,
  minLng: -45.8100,
  maxLng: -45.6000,
} as const;

export const CACAPAVA_CENTER = {
  lat: -23.1006,
  lng: -45.7069,
} as const;

export const DEFAULT_ZOOM = 14;

export const IBGE_CACAPAVA = '3508504';

export const EARTH_RADIUS_METERS = 6371000;

// Raio de interseção de nível 1 para deduplicação (<= 40m)
export const DUPLICATE_RADIUS_METERS = 40;

// Raio de presença física para voto Waze presencial (<= 150m)
export const PRESENTIAL_RADIUS_METERS = 150;

// Raio de tolerância para foto EXIF verificada no local (<= 250m)
export const EXIF_LOCAL_VERIFIED_RADIUS_METERS = 250;

// ==========================================
// 2. Validações e Cálculos Geodésicos
// ==========================================

/**
 * Verifica se uma coordenada está estritamente contida dentro do Bounding Box
 * oficial do município de Caçapava - SP.
 *
 * Latitudes válidas:  [-23.2600, -22.9500]
 * Longitudes válidas: [-45.8100, -45.6000]
 */
export function isWithinCacapava(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return false;
  }
  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    return false;
  }
  return (
    lat >= CACAPAVA_BOUNDS.minLat &&
    lat <= CACAPAVA_BOUNDS.maxLat &&
    lng >= CACAPAVA_BOUNDS.minLng &&
    lng <= CACAPAVA_BOUNDS.maxLng
  );
}

/**
 * Calcula a distância exata em metros entre dois pontos geográficos
 * utilizando a fórmula do Haversine esférico (raio = 6.371.000m).
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  // Clamping em [0, 1] para evitar erros de ponto flutuante no arco-seno
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  // Retorna com 1 casa decimal de precisão
  return Math.round(EARTH_RADIUS_METERS * c * 10) / 10;
}

// ==========================================
// 3. Normalização de Vias e street_group_key
// ==========================================

/**
 * Normaliza o nome de um logradouro:
 * 1. Remove diacríticos e acentuação (NFD)
 * 2. Converte para minúsculas
 * 3. Padroniza prefixos e títulos urbanos comuns (av, r, pca, estr, rod, cel, dr, prof, sta, sto)
 * 4. Remove caracteres especiais e pontuação
 * 5. Substitui espaços múltiplos por hífen único
 *
 * Exemplo: "Av. Brasil" -> "avenida-brasil"
 * Exemplo: "Av. Cel. Manoel Inocêncio" -> "avenida-coronel-manoel-inocencio"
 * Exemplo: "Rua Marquês de Herval" -> "rua-marques-de-herval"
 */
export function normalizeStreetName(rawStreet: string): string {
  if (!rawStreet || typeof rawStreet !== 'string') {
    return 'via-nao-identificada';
  }

  let normalized = rawStreet
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Remove caracteres que não sejam letras, números, espaços ou pontos
  normalized = normalized.replace(/[^a-z0-9\s.]/g, ' ');

  // Expande abreviações e prefixos em qualquer posição respeitando limites de palavras
  normalized = normalized
    .replace(/\b(av\.|av)\b/gi, 'avenida')
    .replace(/\b(r\.|r)\b/gi, 'rua')
    .replace(/\b(p(c|ç)a\.|p(c|ç)a|praca)\b/gi, 'praca')
    .replace(/\b(al\.|al|alameda)\b/gi, 'alameda')
    .replace(/\b(estr\.|estr|estrada)\b/gi, 'estrada')
    .replace(/\b(rod\.|rod|rodovia)\b/gi, 'rodovia')
    .replace(/\b(cel\.|cel|coronel)\b/gi, 'coronel')
    .replace(/\b(dr\.|dr|doutor)\b/gi, 'doutor')
    .replace(/\b(dra\.|dra|doutora)\b/gi, 'doutora')
    .replace(/\b(prof\.|prof|professor)\b/gi, 'professor')
    .replace(/\b(profa\.|profa|professora)\b/gi, 'professora')
    .replace(/\b(trav\.|trav|travessa)\b/gi, 'travessa')
    .replace(/\b(jd\.|jd|jardim)\b/gi, 'jardim')
    .replace(/\b(pq\.|pq|parque)\b/gi, 'parque')
    .replace(/\b(res\.|res|residencial)\b/gi, 'residencial')
    .replace(/\b(sta\.|sta|santa)\b/gi, 'santa')
    .replace(/\b(sto\.|sto|santo)\b/gi, 'santo');

  // Remove pontos restantes e múltiplos espaços
  normalized = normalized.replace(/\./g, ' ').replace(/\s+/g, '-').trim();

  // Remove hífens sobrando no início ou no fim
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized || 'via-nao-identificada';
}

/**
 * Gera a chave única de agrupamento de via e categoria (street_group_key).
 * Utilizada para agregar automaticamente chamados no Dossiê de Rua (Nível 2).
 *
 * Exemplo: buildStreetGroupKey("Av. Brasil", "buracos_vias")
 *          -> "avenida-brasil::buracos_vias"
 */
export function buildStreetGroupKey(streetName: string, category: string): string {
  const normStreet = normalizeStreetName(streetName);
  const normCategory = (category || 'geral')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');

  return `${normStreet}::${normCategory}`;
}

// ==========================================
// 4. Catálogo de Bairros e Logradouros de Caçapava
// ==========================================

export const CACAPAVA_NEIGHBORHOODS: string[] = [
  'Centro',
  'Vera Cruz',
  'Jardim Caçapava',
  'Vila Resende',
  'Vila São João',
  'Vila Paraíso',
  'Parque Residencial Nova Caçapava',
  'Vila Menino Jesus',
  'Piedade',
  'Aldeias da Serra',
  'Jardim Maria Elmira',
  'Jardim Panorama',
  'Parque Industrial',
  'Vila Galvão',
  'Jardim Amália',
  'Pinus do Iriguassu',
  'Borda da Mata',
  'Santa Luzia',
  'Vila Santos',
  'Campo Grande',
  'Caçapava Velha',
  'Jardim Rafael',
  'Residencial Santo André',
  'Vila Antônio Augusto',
  'Vila Santa Isabel',
];

export interface LocalStreetEntry {
  street: string;
  neighborhood: string;
  aliases?: string[];
}

export const CACAPAVA_MAJOR_STREETS: LocalStreetEntry[] = [
  {
    street: 'Avenida Brasil',
    neighborhood: 'Vera Cruz',
    aliases: ['Av. Brasil', 'Av Brasil'],
  },
  {
    street: 'Rua São Bento',
    neighborhood: 'Vila Resende',
    aliases: ['R. São Bento', 'Rua Sao Bento'],
  },
  {
    street: 'Avenida Coronel Manoel Inocêncio',
    neighborhood: 'Centro',
    aliases: ['Av. Cel. Manoel Inocêncio', 'Cel Manoel Inocencio', 'Av. Coronel Manoel Inocencio'],
  },
  {
    street: 'Rua Dr. José de Moura Resende',
    neighborhood: 'Vila Paraíso',
    aliases: ['R. Dr. Jose de Moura Resende', 'Rua Jose de Moura Resende', 'Dr Jose de Moura'],
  },
  {
    street: 'Rua Marquês de Herval',
    neighborhood: 'Centro',
    aliases: ['R. Marques de Herval', 'Marques do Herval'],
  },
  {
    street: 'Avenida da Saudade',
    neighborhood: 'Parque Residencial Nova Caçapava',
    aliases: ['Av. da Saudade', 'Av Saudade'],
  },
  {
    street: 'Rua Capitão Carlos de Moura',
    neighborhood: 'Centro',
    aliases: ['R. Cap. Carlos de Moura', 'Capitao Carlos de Moura'],
  },
  {
    street: 'Rua Prudente de Moraes',
    neighborhood: 'Centro',
    aliases: ['R. Prudente de Moraes', 'Prudente de Morais'],
  },
  {
    street: 'Avenida Doutor Pereira Barbosa',
    neighborhood: 'Vila Menino Jesus',
    aliases: ['Av. Dr. Pereira Barbosa', 'Dr Pereira Barbosa'],
  },
  {
    street: 'Avenida Henry Nestlé',
    neighborhood: 'Vila Galvão',
    aliases: ['Av. Henry Nestle', 'Henry Nestle'],
  },
  {
    street: 'Estrada Municipal Caçapava Velha',
    neighborhood: 'Caçapava Velha',
    aliases: ['Estrada Cacapava Velha', 'Estr. Cacapava Velha'],
  },
  {
    street: 'Avenida Subtenente Luiz Gonzaga de Toledo',
    neighborhood: 'Vera Cruz',
    aliases: ['Av. Subtenente Luiz Gonzaga', 'Subtenente Luiz Gonzaga de Toledo'],
  },
  {
    street: 'Rua 13 de Maio',
    neighborhood: 'Centro',
    aliases: ['R. Treze de Maio', 'Rua Treze de Maio'],
  },
  {
    street: 'Rua Barão de Jaceguai',
    neighborhood: 'Centro',
    aliases: ['R. Barao de Jaceguai', 'Barao de Jaceguai'],
  },
  {
    street: 'Rua 28 de Setembro',
    neighborhood: 'Centro',
    aliases: ['R. Vinte e Oito de Setembro', '28 de Setembro'],
  },
  {
    street: 'Rua Major Alberto de Paiva',
    neighborhood: 'Jardim Caçapava',
    aliases: ['R. Maj. Alberto de Paiva'],
  },
  {
    street: 'Avenida General Oliveira Ramos',
    neighborhood: 'Vila Santos',
    aliases: ['Av. Gen. Oliveira Ramos'],
  },
  {
    street: 'Rua Marechal Deodoro',
    neighborhood: 'Centro',
    aliases: ['R. Mal. Deodoro', 'Marechal Deodoro da Fonseca'],
  },
];

/**
 * Busca ruas no catálogo local de Caçapava por aproximação de texto.
 */
export function searchLocalStreets(query: string, limit = 6): LocalStreetEntry[] {
  if (!query || typeof query !== 'string') return [];
  const cleanQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (cleanQuery.length < 2) return [];

  const results: LocalStreetEntry[] = [];

  for (const entry of CACAPAVA_MAJOR_STREETS) {
    const streetNorm = entry.street
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const neighNorm = entry.neighborhood
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    let matched = streetNorm.includes(cleanQuery) || neighNorm.includes(cleanQuery);

    if (!matched && entry.aliases) {
      for (const alias of entry.aliases) {
        const aliasNorm = alias
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (aliasNorm.includes(cleanQuery)) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Busca bairros no catálogo local de Caçapava.
 */
export function searchLocalNeighborhoods(query: string, limit = 6): string[] {
  if (!query || typeof query !== 'string') return CACAPAVA_NEIGHBORHOODS.slice(0, limit);
  const cleanQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return CACAPAVA_NEIGHBORHOODS.filter((n) =>
    n
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(cleanQuery)
  ).slice(0, limit);
}
