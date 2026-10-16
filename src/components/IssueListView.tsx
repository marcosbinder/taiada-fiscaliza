/**
 * src/components/IssueListView.tsx
 *
 * Visualização Alternativa em Lista de Demandas Urbanas de Caçapava - SP
 * Taiada Fiscaliza ("Cobra, Taiada!").
 *
 * Agrupada por Bairro e Rua, com destaques para Dossiês de Rua,
 * filtros por categoria/status e ordenação por urgência/moradores afetados.
 */

import React, { useState, useMemo } from 'react';
import {
  Issue,
  IssueCategory,
  ResolutionStatus,
  StreetDossier,
} from '../shared/types';
import { CATEGORY_MAP, CATEGORIES_LIST, SEVERITY_LEVELS } from '../shared/categories';
import { getStatusVisual } from './MapPinFactory';

export interface IssueListViewProps {
  issues: Issue[];
  streetDossiers: StreetDossier[];
  selectedCategory: IssueCategory | 'all';
  onSelectCategory: (cat: IssueCategory | 'all') => void;
  onSelectIssue: (issue: Issue) => void;
  onSelectDossier: (dossier: StreetDossier) => void;
  onViewOnMap: (issue: Issue) => void;
}

type SortOption = 'upvotes' | 'severity' | 'recent';

export const IssueListView: React.FC<IssueListViewProps> = ({
  issues,
  streetDossiers,
  selectedCategory,
  onSelectCategory,
  onSelectIssue,
  onSelectDossier,
  onViewOnMap,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ResolutionStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('upvotes');

  // Filtragem dos chamados
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // Filtro de categoria
      if (selectedCategory !== 'all' && issue.category !== selectedCategory) {
        return false;
      }
      // Filtro de status
      if (selectedStatus !== 'all' && issue.resolution_status !== selectedStatus) {
        return false;
      }
      // Filtro de busca textual
      if (searchTerm.trim().length > 0) {
        const query = searchTerm.toLowerCase();
        const matchTitle = issue.title.toLowerCase().includes(query);
        const matchStreet = issue.street_name.toLowerCase().includes(query);
        const matchNeigh = issue.neighborhood.toLowerCase().includes(query);
        const matchDesc = issue.description.toLowerCase().includes(query);
        const matchRef = issue.reference_point?.toLowerCase().includes(query);
        return matchTitle || matchStreet || matchNeigh || matchDesc || matchRef;
      }
      return true;
    });
  }, [issues, selectedCategory, selectedStatus, searchTerm]);

  // Ordenação dos chamados filtrados
  const sortedIssues = useMemo(() => {
    const list = [...filteredIssues];
    switch (sortBy) {
      case 'upvotes':
        return list.sort((a, b) => b.upvotes_count - a.upvotes_count);
      case 'severity':
        return list.sort((a, b) => b.severity - a.severity);
      case 'recent':
      default:
        return list.sort((a, b) => b.created_at - a.created_at);
    }
  }, [filteredIssues, sortBy]);

  // Agrupamento por Bairro e Rua
  const groupedByNeighborhood = useMemo(() => {
    const groups: Record<string, Record<string, Issue[]>> = {};

    for (const issue of sortedIssues) {
      const neigh = issue.neighborhood || 'Outros Bairros';
      const street = issue.street_name || 'Vias Diversas';

      if (!groups[neigh]) groups[neigh] = {};
      if (!groups[neigh][street]) groups[neigh][street] = [];

      groups[neigh][street].push(issue);
    }

    return groups;
  }, [sortedIssues]);

  // Mapa de Dossiês por street_group_key
  const dossierMap = useMemo(() => {
    const map = new Map<string, StreetDossier>();
    for (const d of streetDossiers) {
      map.set(d.street_group_key, d);
    }
    return map;
  }, [streetDossiers]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6 pb-28">
      {/* 1. Barra de Controles e Filtros Rápidos */}
      <div className="bg-white/80 dark:bg-taiada-dark/80 backdrop-blur-xl rounded-3xl p-4 shadow-lg border border-taiada-primary/20 space-y-3">
        {/* Campo de Busca */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por rua, bairro ou problema em Caçapava..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-white border border-taiada-primary/20 focus:outline-none focus:ring-2 focus:ring-taiada-primary text-base"
          />
          <div className="absolute left-3.5 top-3.5 text-taiada-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3.5 top-3.5 text-gray-400 hover:text-taiada-dark"
            >
              ✕
            </button>
          )}
        </div>

        {/* Linha de Filtros: Status e Ordenação */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all ${
                selectedStatus === 'all'
                  ? 'bg-taiada-dark text-white shadow'
                  : 'bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-gray-300 hover:bg-taiada-primary/10'
              }`}
            >
              Todos ({issues.length})
            </button>
            <button
              onClick={() => setSelectedStatus('open')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all ${
                selectedStatus === 'open'
                  ? 'bg-taiada-primary text-white shadow'
                  : 'bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-gray-300'
              }`}
            >
              Abertos
            </button>
            <button
              onClick={() => setSelectedStatus('verifying_resolution')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all ${
                selectedStatus === 'verifying_resolution'
                  ? 'bg-amber-500 text-white shadow'
                  : 'bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-gray-300'
              }`}
            >
              Em Verificação
            </button>
            <button
              onClick={() => setSelectedStatus('reopened')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all ${
                selectedStatus === 'reopened'
                  ? 'bg-red-600 text-white shadow'
                  : 'bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-gray-300'
              }`}
            >
              Reabertos
            </button>
            <button
              onClick={() => setSelectedStatus('resolved_community')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all ${
                selectedStatus === 'resolved_community'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-gray-300'
              }`}
            >
              Resolvidos
            </button>
          </div>

          {/* Seletor de Ordenação */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-white rounded-xl px-2.5 py-1.5 border border-taiada-primary/20 text-xs font-semibold focus:outline-none"
            >
              <option value="upvotes">Mais Apoiados (Apoios)</option>
              <option value="severity">Mais Graves (1 a 5)</option>
              <option value="recent">Mais Recentes</option>
            </select>
          </div>
        </div>

        {/* Pílulas de Categoria */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => onSelectCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'all'
                ? 'bg-taiada-dark text-white'
                : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
            }`}
          >
            Todas as Categorias
          </button>
          {CATEGORIES_LIST.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'text-white shadow'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
              }`}
              style={{
                backgroundColor: selectedCategory === cat.id ? cat.color : undefined,
              }}
            >
              {cat.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Lista Agrupada por Bairro e Rua */}
      {Object.keys(groupedByNeighborhood).length === 0 ? (
        <div className="bg-white/90 dark:bg-taiada-dark/90 rounded-3xl p-8 text-center shadow-md space-y-3 border border-taiada-primary/20">
          <p className="text-lg font-bold text-taiada-dark dark:text-white">
            Nenhuma demanda encontrada
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tente remover os filtros ou buscar por outra rua de Caçapava.
          </p>
        </div>
      ) : (
        Object.entries(groupedByNeighborhood).map(([neighborhood, streets]) => (
          <div key={neighborhood} className="space-y-4">
            {/* Cabeçalho do Bairro */}
            <div className="flex items-center gap-2 px-1">
              <span className="w-2.5 h-2.5 rounded-full bg-taiada-primary"></span>
              <h2 className="text-base font-extrabold text-taiada-dark dark:text-white tracking-tight">
                {neighborhood}
              </h2>
              <span className="text-xs text-gray-500 font-semibold">
                ({Object.values(streets).reduce((acc, curr) => acc + curr.length, 0)} relatos)
              </span>
            </div>

            {/* Ruas do Bairro */}
            {Object.entries(streets).map(([streetName, streetIssues]) => {
              // Verifica se essa rua possui Dossiê ativo
              const activeDossier = Array.from(dossierMap.values()).find(
                (d) => d.street_name.toLowerCase() === streetName.toLowerCase()
              );

              return (
                <div
                  key={streetName}
                  className="bg-white/90 dark:bg-taiada-dark/90 rounded-3xl p-4 shadow-sm border border-taiada-primary/10 space-y-3"
                >
                  {/* Nome da Rua + Destaque Dossiê */}
                  <div className="flex items-center justify-between border-b border-taiada-primary/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-taiada-dark dark:text-white">
                        📍 {streetName}
                      </span>
                      <span className="text-xs text-gray-500">({streetIssues.length})</span>
                    </div>

                    {activeDossier && (
                      <button
                        onClick={() => onSelectDossier(activeDossier)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-gradient-to-r from-taiada-dark to-taiada-primary text-white shadow-sm flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        <span>📁 Dossiê Ativo ({activeDossier.issues_count})</span>
                        <span>→</span>
                      </button>
                    )}
                  </div>

                  {/* Banner Dossiê se ativo para a rua */}
                  {activeDossier && (
                    <div className="bg-gradient-to-r from-taiada-dark/10 to-taiada-primary/15 rounded-2xl p-3 border border-taiada-primary/30 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-extrabold text-taiada-dark dark:text-white">
                          Dossiê Coletivo da Via: {activeDossier.category_label}
                        </p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-300">
                          {activeDossier.issues_count} pontos críticos • {activeDossier.total_upvotes} munícipes afetados
                        </p>
                      </div>
                      <button
                        onClick={() => onSelectDossier(activeDossier)}
                        className="px-3 py-1.5 rounded-xl bg-taiada-primary text-white font-bold hover:bg-taiada-dark transition-colors"
                      >
                        Abrir Dossiê
                      </button>
                    </div>
                  )}

                  {/* Cards de Demandas da Rua */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {streetIssues.map((issue) => {
                      const catDef = CATEGORY_MAP[issue.category] || CATEGORY_MAP.buracos_vias;
                      const statusDef = getStatusVisual(issue.resolution_status);
                      const sevDef = SEVERITY_LEVELS[issue.severity];

                      return (
                        <div
                          key={issue.id}
                          className="bg-white dark:bg-taiada-darkBg/60 rounded-2xl p-3.5 border border-taiada-primary/15 shadow-sm hover:border-taiada-primary/40 transition-all flex flex-col justify-between space-y-3"
                        >
                          {/* Topo do Card: Categoria, Gravidade e Status */}
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="px-2 py-0.5 rounded-full text-[11px] font-extrabold text-white"
                              style={{ backgroundColor: catDef.color }}
                            >
                              {catDef.shortLabel}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {/* Gravidade */}
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ backgroundColor: sevDef.color }}
                              >
                                {sevDef.shortLabel}
                              </span>

                              {/* Status Ring */}
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-extrabold border"
                                style={{
                                  borderColor: statusDef.ringColor,
                                  color: statusDef.ringColor,
                                }}
                              >
                                {statusDef.badgeLabel}
                              </span>
                            </div>
                          </div>

                          {/* Título e Descrição */}
                          <div className="space-y-1">
                            <h3 className="text-sm font-bold text-taiada-dark dark:text-white line-clamp-1">
                              {issue.title}
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                              {issue.description}
                            </p>
                            {issue.reference_point && (
                              <p className="text-[11px] text-gray-500 italic">
                                Ref: {issue.reference_point}
                              </p>
                            )}
                          </div>

                          {/* Foto e Auditoria EXIF */}
                          {issue.photo_url && (
                            <div className="relative rounded-xl overflow-hidden h-24 bg-gray-100 dark:bg-black/20">
                              <img
                                src={issue.photo_url}
                                alt={issue.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              {issue.exif_verified_local === 1 && (
                                <div className="absolute bottom-1 right-1 bg-taiada-primary/95 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow">
                                  ✓ EXIF no local
                                </div>
                              )}
                            </div>
                          )}

                          {/* Rodapé: Apoios e Ações */}
                          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-white/10 text-xs">
                            <div className="flex items-center gap-1 font-extrabold text-taiada-dark dark:text-white">
                              <span className="text-taiada-primary font-black">▲</span>
                              <span>{issue.upvotes_count} apoios</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onViewOnMap(issue)}
                                className="px-2.5 py-1 rounded-xl bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-white font-bold border border-taiada-primary/20 hover:bg-taiada-primary/10 active:scale-95 transition-all"
                              >
                                🗺 No Mapa
                              </button>
                              <button
                                onClick={() => onSelectIssue(issue)}
                                className="px-3 py-1 rounded-xl bg-taiada-primary text-white font-bold hover:bg-taiada-dark active:scale-95 transition-all shadow-sm"
                              >
                                Detalhes
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
};
