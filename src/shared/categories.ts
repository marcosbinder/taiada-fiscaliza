/**
 * src/shared/categories.ts
 *
 * Catálogo Oficial das 8 Categorias do Taiada Fiscaliza ("Cobra, Taiada!")
 * e Definição da Escala de Gravidade 1..5 com Descrições Concretas de Impacto.
 *
 * Regras Mandatórias:
 * - Foto Obrigatória (5 categorias): buracos_vias, iluminacao, limpeza_mato, calcadas_acessibilidade, sinalizacao_transito.
 * - Foto Opcional (3 categorias): saude, educacao, transporte (com campos auxiliares específicos).
 */

import { IssueCategory, IssueSeverity } from './types';

export interface CategoryAuxiliaryField {
  id: string;
  label: string;
  placeholder: string;
  type: 'text' | 'time';
  required: boolean;
  helpText?: string;
}

export interface CategoryDefinition {
  id: IssueCategory;
  label: string;
  shortLabel: string;
  description: string;
  photoRequired: boolean;
  photoHelpText: string;
  iconName: string; // Identificador de ícone (Lucide)
  color: string;
  auxiliaryFields: CategoryAuxiliaryField[];
}

export const CATEGORY_MAP: Record<IssueCategory, CategoryDefinition> = {
  buracos_vias: {
    id: 'buracos_vias',
    label: 'Buracos e Pavimentação',
    shortLabel: 'Buracos',
    description:
      'Crateras, afundamento de asfalto, valetas, lajotas soltas e problemas na malha viária.',
    photoRequired: true,
    photoHelpText: 'A foto é obrigatória para que a equipe de obras avalie a extensão do buraco.',
    iconName: 'Hammer',
    color: '#dc2626',
    auxiliaryFields: [],
  },
  iluminacao: {
    id: 'iluminacao',
    label: 'Iluminação Pública',
    shortLabel: 'Iluminação',
    description:
      'Lâmpadas queimadas, postes apagados à noite, acesos durante o dia ou fiação caída.',
    photoRequired: true,
    photoHelpText:
      'A foto é obrigatória para identificar o poste e conferir a plaqueta numerada.',
    iconName: 'Lightbulb',
    color: '#f59e0b',
    auxiliaryFields: [
      {
        id: 'pole_number',
        label: 'Número da plaqueta do poste (se visível)',
        placeholder: 'Ex: CP-4812',
        type: 'text',
        required: false,
        helpText: 'Geralmente fica em uma placa amarela ou metálica fixada no poste.',
      },
    ],
  },
  limpeza_mato: {
    id: 'limpeza_mato',
    label: 'Mato Alto e Limpeza Urbana',
    shortLabel: 'Mato / Limpeza',
    description:
      'Mato alto cobrindo calçadas ou canteiros, entulho acumulado, lixo irregular e bueiros entupidos.',
    photoRequired: true,
    photoHelpText: 'A foto é obrigatória para comprovar o acúmulo de sujeira ou mato.',
    iconName: 'Trees',
    color: '#16a34a',
    auxiliaryFields: [],
  },
  calcadas_acessibilidade: {
    id: 'calcadas_acessibilidade',
    label: 'Calçadas e Acessibilidade',
    shortLabel: 'Calçadas',
    description:
      'Pisos quebrados, guias rebaixadas destruídas, falta de rampa para cadeirantes e obstáculos na calçada.',
    photoRequired: true,
    photoHelpText:
      'A foto é obrigatória para registrar a falha de acessibilidade e o desnível do piso.',
    iconName: 'Footprints',
    color: '#2563eb',
    auxiliaryFields: [],
  },
  sinalizacao_transito: {
    id: 'sinalizacao_transito',
    label: 'Sinalização e Trânsito',
    shortLabel: 'Sinalização',
    description:
      'Semáforos apagados ou em amarelo piscante, faixas apagadas, placas caídas ou cobertas por árvores.',
    photoRequired: true,
    photoHelpText:
      'A foto é obrigatória para direcionar o reparo emergencial de trânsito.',
    iconName: 'TrafficCone',
    color: '#ea580c',
    auxiliaryFields: [],
  },
  saude: {
    id: 'saude',
    label: 'Saúde e Postos (UBS)',
    shortLabel: 'Saúde',
    description:
      'Falta de remédios básicos, ausência de médicos, demora excessiva em consultas e infraestrutura de UBS/Fusam.',
    photoRequired: false,
    photoHelpText:
      'Foto opcional. Por respeito à privacidade dos pacientes, você pode relatar sem foto.',
    iconName: 'HeartPulse',
    color: '#059669',
    auxiliaryFields: [
      {
        id: 'health_unit',
        label: 'Nome da Unidade de Saúde (UBS / ESF / Fusam)',
        placeholder: 'Ex: UBS Vila Paraíso ou Fusam',
        type: 'text',
        required: true,
        helpText: 'Informe o posto de saúde de Caçapava onde ocorreu o problema.',
      },
      {
        id: 'approx_time',
        label: 'Horário do atendimento / ocorrência',
        placeholder: 'Ex: 08:30 ou Período da manhã',
        type: 'text',
        required: false,
      },
    ],
  },
  educacao: {
    id: 'educacao',
    label: 'Educação e Escolas Municipais',
    shortLabel: 'Educação',
    description:
      'Problemas estruturais em escolas ou creches (EMEI/EMEF), ventiladores quebrados, merenda ou segurança escolar.',
    photoRequired: false,
    photoHelpText:
      'Foto opcional. Para proteger menores, não fotografe alunos, professores ou salas de aula.',
    iconName: 'GraduationCap',
    color: '#7c3aed',
    auxiliaryFields: [
      {
        id: 'school_name',
        label: 'Nome da Escola ou Creche Municipal (EMEI / EMEF)',
        placeholder: 'Ex: EMEF Prof. Lindolpho Machado',
        type: 'text',
        required: true,
        helpText: 'Informe a unidade de ensino municipal de Caçapava.',
      },
    ],
  },
  transporte: {
    id: 'transporte',
    label: 'Transporte Público e Ônibus',
    shortLabel: 'Transporte',
    description:
      'Atrasos graves de linhas municipais, itinerários ignorados, superlotação ou pontos de ônibus sem abrigo.',
    photoRequired: false,
    photoHelpText:
      'Foto opcional. Caso o abrigo físico do ponto esteja quebrado, sinta-se livre para anexar uma foto.',
    iconName: 'Bus',
    color: '#0891b2',
    auxiliaryFields: [
      {
        id: 'bus_line',
        label: 'Número ou Nome da Linha de Ônibus',
        placeholder: 'Ex: Linha 03 - Piedade / Centro',
        type: 'text',
        required: true,
        helpText: 'Informe a linha de ônibus municipal de Caçapava.',
      },
      {
        id: 'stop_reference',
        label: 'Ponto de referência do ponto de embarque',
        placeholder: 'Ex: Próximo à praça da Vila Menino Jesus',
        type: 'text',
        required: false,
      },
    ],
  },
};

export const CATEGORIES_LIST: CategoryDefinition[] = Object.values(CATEGORY_MAP);

/**
 * Escala de Gravidade 1 a 5 com descrições concretas de impacto comunitário.
 */
export interface SeverityDefinition {
  level: IssueSeverity;
  label: string;
  shortLabel: string;
  description: string;
  impactExample: string;
  color: string;
}

export const SEVERITY_LEVELS: Record<IssueSeverity, SeverityDefinition> = {
  1: {
    level: 1,
    label: 'Baixa • Incômodo Leve',
    shortLabel: 'Baixa (1/5)',
    description:
      'Problema leve que causa desconforto estético ou incômodo pequeno, sem risco à segurança.',
    impactExample: 'Ex: Mato ralo no canteiro central, lâmpada piscando esporadicamente.',
    color: '#347947',
  },
  2: {
    level: 2,
    label: 'Moderada • Atenção Necessária',
    shortLabel: 'Moderada (2/5)',
    description:
      'Dificulta o trânsito rotineiro de pedestres ou ciclistas, exigindo desvios simples.',
    impactExample: 'Ex: Pequeno buraco na beira da via, mato alto cobrindo parte da calçada.',
    color: '#65a30d',
  },
  3: {
    level: 3,
    label: 'Significativa • Dano Potencial',
    shortLabel: 'Média (3/5)',
    description:
      'Risco direto de danos mecânicos em veículos (pneu rasgado, suspensão) ou tropeços de pedestres.',
    impactExample: 'Ex: Buraco profundo na faixa de rolagem, calçada desnivelada com lajota solta.',
    color: '#d97706',
  },
  4: {
    level: 4,
    label: 'Grave • Risco à Integridade',
    shortLabel: 'Grave (4/5)',
    description:
      'Alto potencial de provocar acidentes com motos, quedas de idosos ou rua totalmente escura à noite.',
    impactExample: 'Ex: Cratera grande na curva, poste apagado em ponto de ônibus perigoso.',
    color: '#ea580c',
  },
  5: {
    level: 5,
    label: 'Crítica • Perigo Iminente',
    shortLabel: 'Crítica (5/5)',
    description:
      'Risco grave de morte, colisões frontais ou paralisação total de serviço público essencial.',
    impactExample:
      'Ex: Semáforo apagado em cruzamento de alto tráfego, asfalto cedendo com cratera intransitável.',
    color: '#dc2626',
  },
};

export const SEVERITY_LEVELS_LIST: SeverityDefinition[] = Object.values(SEVERITY_LEVELS);

/**
 * Retorna true se a categoria exige foto obrigatória.
 */
export function isPhotoRequired(category: IssueCategory): boolean {
  const def = CATEGORY_MAP[category];
  return def ? def.photoRequired : true;
}

/**
 * Obtém a definição completa da categoria.
 */
export function getCategoryDefinition(category: IssueCategory): CategoryDefinition {
  return (
    CATEGORY_MAP[category] || {
      id: category,
      label: 'Demanda Geral',
      shortLabel: 'Geral',
      description: 'Zeladoria urbana geral.',
      photoRequired: true,
      photoHelpText: 'A foto ajuda a localizar o problema.',
      iconName: 'AlertCircle',
      color: '#347947',
      auxiliaryFields: [],
    }
  );
}

/**
 * Obtém a definição da gravidade.
 */
export function getSeverityDefinition(level: IssueSeverity): SeverityDefinition {
  return SEVERITY_LEVELS[level] || SEVERITY_LEVELS[3];
}

/**
 * Validação dos campos auxiliares por categoria.
 */
export function validateAuxiliaryData(
  category: IssueCategory,
  data?: Record<string, unknown> | null
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const def = CATEGORY_MAP[category];
  if (!def || !def.auxiliaryFields.length) {
    return { valid: true, errors: [] };
  }

  for (const field of def.auxiliaryFields) {
    if (field.required) {
      const val = data ? data[field.id] : undefined;
      if (!val || typeof val !== 'string' || val.trim().length === 0) {
        errors.push(`O campo "${field.label}" é obrigatório para a categoria ${def.label}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
