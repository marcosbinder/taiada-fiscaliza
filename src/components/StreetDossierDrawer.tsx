/**
 * src/components/StreetDossierDrawer.tsx
 *
 * Gaveta do Dossiê Mestre da Via (Agrupamento Nível 2) do Taiada Fiscaliza ("Cobra, Taiada!").
 * Agrupa >= 2 chamados ativos na mesma via e categoria (ex: Avenida Brasil :: Buracos).
 */

import React from 'react';
import {
  FileText,
  Share2,
  Users,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { FluidBottomSheet } from './FluidBottomSheet';
import { StreetDossier } from '../shared/types';
import { getSeverityDefinition } from '../shared/categories';

export interface StreetDossierDrawerProps {
  dossier: StreetDossier | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectIssuePoint: (issueId: string) => void;
  onOpenDossierDocument: (dossier: StreetDossier) => void;
  onOpenDossierShare: (dossier: StreetDossier) => void;
}

export const StreetDossierDrawer: React.FC<StreetDossierDrawerProps> = ({
  dossier,
  isOpen,
  onClose,
  onSelectIssuePoint,
  onOpenDossierDocument,
  onOpenDossierShare,
}) => {
  if (!dossier) return null;

  return (
    <FluidBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      initialSnap="half"
      title={
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-taiada-primary" />
          <span className="text-sm font-bold text-taiada-dark dark:text-white">
            Dossiê Coletivo da Via
          </span>
        </div>
      }
      headerRight={
        <button
          type="button"
          onClick={() => onOpenDossierShare(dossier)}
          className="p-2 text-taiada-primary hover:bg-taiada-primary/10 rounded-full transition-all active:scale-95"
          title="Compartilhar Dossiê"
        >
          <Share2 className="w-5 h-5" />
        </button>
      }
    >
      <div className="space-y-5">
        {/* Cabeçalho da Via */}
        <div>
          <h2 className="text-xl font-black text-taiada-dark dark:text-white leading-tight">
            {dossier.street_name}
          </h2>
          <p className="text-xs text-taiada-primary font-semibold mt-0.5">
            {dossier.category_label} • Caçapava - SP
          </p>
        </div>

        {/* Quadro de Métricas Agregadas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 bg-taiada-primary/10 border border-taiada-primary/20 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-taiada-primary text-white flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-black text-taiada-dark dark:text-white block">
                {dossier.issues_count}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                Pontos Críticos
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-taiada-dark/10 dark:bg-white/5 border border-taiada-dark/20 dark:border-white/10 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-taiada-dark text-white flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-black text-taiada-dark dark:text-white block">
                {dossier.total_upvotes}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                Moradores Afetados
              </span>
            </div>
          </div>
        </div>

        {/* Lista de Pontos Numerados (#1, #2, #3...) */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
            Pontos Mapeados ao Longo da Via:
          </h3>
          <div className="space-y-2">
            {dossier.points.map((pt) => {
              const sev = getSeverityDefinition(pt.severity);
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectIssuePoint(pt.id);
                  }}
                  className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-taiada-dark hover:border-taiada-primary/40 flex items-center justify-between text-left transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-taiada-primary text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                      #{pt.point_number}
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-taiada-dark dark:text-white truncate block">
                        {pt.title}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span style={{ color: sev.color }} className="font-bold">
                          Gravidade {pt.severity}/5
                        </span>
                        <span>•</span>
                        <span>{pt.upvotes_count} apoios</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Ação de Alto Impacto: Ofício Coletivo da Via */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <button
            type="button"
            onClick={() => onOpenDossierDocument(dossier)}
            className="w-full py-3.5 bg-gradient-to-r from-taiada-dark to-taiada-primary text-white font-bold rounded-2xl shadow-lg hover:opacity-95 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" />
            Emitir Ofício Coletivo da Via (PDF / Impressão)
          </button>

          <button
            type="button"
            onClick={() => onOpenDossierShare(dossier)}
            className="w-full py-2.5 bg-green-600 text-white font-bold rounded-2xl shadow-md hover:bg-green-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs"
          >
            <Share2 className="w-4 h-4" />
            Mobilizar Moradores da Rua no WhatsApp
          </button>
        </div>
      </div>
    </FluidBottomSheet>
  );
};
