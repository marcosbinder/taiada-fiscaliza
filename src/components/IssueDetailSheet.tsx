/**
 * src/components/IssueDetailSheet.tsx
 *
 * Bottom Sheet com Detalhes Completos da Demanda Cívica do Taiada Fiscaliza ("Cobra, Taiada!").
 *
 * Recursos:
 * - Galeria com suporte a Modo Economia de Dados (3G/4G).
 * - Selo de Auditoria EXIF com data/hora e coordenadas validadas.
 * - Linha do tempo auditável de eventos históricos.
 * - Motor de Validação Waze com checagem de distância GPS em tempo real (<= 150m vs Remoto).
 * - Ações de Compartilhamento no WhatsApp e Geração de Ofício Oficial.
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  FileText,
  MapPin,
  RotateCcw,
  Share2,
  ShieldCheck,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { FluidBottomSheet } from './FluidBottomSheet';
import { Issue, VoteType } from '../shared/types';
import { getCategoryDefinition, getSeverityDefinition } from '../shared/categories';
import { haversineDistanceMeters, PRESENTIAL_RADIUS_METERS } from '../shared/geo';

export interface IssueDetailSheetProps {
  issue: Issue | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenShare: (issue: Issue) => void;
  onOpenDocument: (issue: Issue) => void;
  onVoteSuccess?: () => void;
  dataSaverMode?: boolean;
}

export const IssueDetailSheet: React.FC<IssueDetailSheetProps> = ({
  issue,
  isOpen,
  onClose,
  onOpenShare,
  onOpenDocument,
  onVoteSuccess,
  dataSaverMode = false,
}) => {
  const [photoLoaded, setPhotoLoaded] = useState(!dataSaverMode);
  const [isVoting, setIsVoting] = useState(false);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

  if (!issue) return null;

  const categoryDef = getCategoryDefinition(issue.category);
  const severityDef = getSeverityDefinition(issue.severity);

  // Votação Waze com medição GPS em tempo real
  const handleVote = async (type: VoteType) => {
    setIsVoting(true);
    setVoteFeedback(null);

    let voterLat: number | undefined;
    let voterLng: number | undefined;
    let isPresential = false;

    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 6000,
          });
        });
        voterLat = pos.coords.latitude;
        voterLng = pos.coords.longitude;

        const dist = haversineDistanceMeters(voterLat, voterLng, issue.latitude, issue.longitude);
        if (dist <= PRESENTIAL_RADIUS_METERS) {
          isPresential = true;
        }
      } catch {
        // Se permissão negada, continua como voto remoto
      }
    }

    try {
      const formData = new FormData();
      formData.append('vote_type', type);
      if (voterLat) formData.append('voter_latitude', String(voterLat));
      if (voterLng) formData.append('voter_longitude', String(voterLng));

      const res = await fetch(`/api/issues/${issue.id}/interact`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Falha ao registrar voto.');
      }

      if (type === 'upvote') {
        setVoteFeedback('Apoio registrado com sucesso! Obrigado por fortalecer Caçapava.');
      } else if (isPresential) {
        setVoteFeedback('📍 Presença confirmada no local (peso 3,0)! Voto registrado.');
      } else {
        setVoteFeedback('🌐 Voto remoto registrado (peso 0,5).');
      }

      if (onVoteSuccess) onVoteSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoteFeedback(`Erro: ${msg}`);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <FluidBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      initialSnap="expanded"
      title={
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-taiada-primary/10 text-taiada-primary">
            {issue.id}
          </span>
          <span className="text-sm font-semibold text-taiada-dark dark:text-white truncate">
            {issue.neighborhood}
          </span>
        </div>
      }
      headerRight={
        <button
          type="button"
          onClick={() => onOpenShare(issue)}
          className="p-2 text-taiada-primary hover:bg-taiada-primary/10 rounded-full transition-all active:scale-95"
          title="Compartilhar no Zap"
        >
          <Share2 className="w-5 h-5" />
        </button>
      }
    >
      <div className="space-y-5">
        {/* Foto com suporte a Modo Economia de Dados */}
        {issue.photo_url && (
          <div className="relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-h-[180px] max-h-[320px]">
            {photoLoaded ? (
              <img
                src={issue.photo_url}
                alt={issue.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-44 flex flex-col items-center justify-center p-4 text-center">
                <span className="text-xs text-gray-500 mb-2">
                  Modo Economia de Dados (3G/4G) ativado
                </span>
                <button
                  type="button"
                  onClick={() => setPhotoLoaded(true)}
                  className="px-4 py-2 bg-taiada-primary text-white text-xs font-bold rounded-xl shadow-md active:scale-95"
                >
                  Carregar Foto (~90 KB)
                </button>
              </div>
            )}

            {/* Selo de Auditoria EXIF */}
            {issue.exif_verified_local === 1 && (
              <div className="absolute top-2 left-2 px-2.5 py-1 bg-taiada-dark/85 text-white backdrop-blur-md rounded-xl text-[11px] font-semibold flex items-center gap-1.5 shadow-md">
                <ShieldCheck className="w-3.5 h-3.5 text-taiada-primary" />
                <span>Foto verificada no local (EXIF)</span>
              </div>
            )}
          </div>
        )}

        {/* Título e Badges */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-bold text-white shadow-sm"
              style={{ backgroundColor: categoryDef.color }}
            >
              {categoryDef.shortLabel}
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-bold text-white shadow-sm"
              style={{ backgroundColor: severityDef.color }}
            >
              {severityDef.shortLabel}
            </span>

            {/* Status Waze */}
            {issue.resolution_status === 'resolved_community' && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 font-bold">
                ✓ Resolvido por Moradores
              </span>
            )}
            {issue.resolution_status === 'verifying_resolution' && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 font-bold">
                ⏳ Em Verificação Comunitária
              </span>
            )}
            {issue.resolution_status === 'reopened' && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 font-bold flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                Problema Reincidente ({issue.reopened_count}x)
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold text-taiada-dark dark:text-white leading-tight">
            {issue.title}
          </h2>

          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            <MapPin className="w-3.5 h-3.5 text-taiada-primary" />
            <span>
              {issue.street_name}, {issue.neighborhood}
              {issue.reference_point ? ` • ${issue.reference_point}` : ''}
            </span>
          </div>
        </div>

        {/* Protocolo Oficial se houver */}
        {issue.official_protocol_number && (
          <div className="p-3 bg-taiada-primary/10 border border-taiada-primary/30 rounded-xl flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-taiada-primary flex-shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-taiada-dark dark:text-white block">
                Protocolo Oficial do Gabinete / Câmara:
              </span>
              <span className="text-taiada-primary font-mono font-medium">
                {issue.official_protocol_number}
              </span>
            </div>
          </div>
        )}

        {/* Descrição */}
        <div className="bg-gray-50 dark:bg-taiada-dark/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
            {issue.description}
          </p>
          {issue.author_name && (
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700/60 text-xs text-gray-400">
              Relatado por: <strong>{issue.author_name}</strong>
            </div>
          )}
        </div>

        {/* Prova Social e Saldo Waze */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-white dark:bg-taiada-dark rounded-xl border border-gray-200 dark:border-gray-700 text-center">
            <span className="text-2xl font-black text-taiada-dark dark:text-white block">
              {issue.upvotes_count}
            </span>
            <span className="text-xs text-gray-500 font-medium">Moradores Apoiando</span>
          </div>
          <div className="p-3 bg-white dark:bg-taiada-dark rounded-xl border border-gray-200 dark:border-gray-700 text-center">
            <span className="text-2xl font-black text-taiada-primary block">
              {issue.consensus_score.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500 font-medium">Saldo de Consenso Waze</span>
          </div>
        </div>

        {/* Ações de Validação Comunitária Waze */}
        <div className="space-y-2 pt-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
            Validação Comunitária (Estilo Waze):
          </label>

          <button
            type="button"
            disabled={isVoting}
            onClick={() => handleVote('upvote')}
            className="w-full py-3 bg-taiada-primary text-white font-bold rounded-2xl shadow-md hover:bg-taiada-dark transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ThumbsUp className="w-4 h-4" />
            Cobra, Taiada! Também passo por aqui (+1 Apoio)
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isVoting}
              onClick={() => handleVote('resolved_yes')}
              className="py-2.5 px-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-bold rounded-xl text-xs hover:bg-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Já foi resolvido!
            </button>
            <button
              type="button"
              disabled={isVoting}
              onClick={() => handleVote('resolved_no_returned')}
              className="py-2.5 px-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 font-bold rounded-xl text-xs hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              Ainda está lá / Voltou
            </button>
          </div>

          {voteFeedback && (
            <p className="text-xs text-center font-medium text-taiada-primary dark:text-emerald-400 py-1">
              {voteFeedback}
            </p>
          )}
        </div>

        {/* Ações Institucionais e Virais */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onOpenDocument(issue)}
            className="w-full py-3 bg-taiada-dark text-white font-bold rounded-2xl shadow-md hover:bg-taiada-primary transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Gerar Ofício / Minuta para Prefeitura e Câmara
          </button>

          <button
            type="button"
            onClick={() => onOpenShare(issue)}
            className="w-full py-2.5 bg-green-600 text-white font-bold rounded-2xl shadow-md hover:bg-green-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
          >
            <Share2 className="w-4 h-4" />
            Mobilizar Vizinhos no WhatsApp
          </button>
        </div>
      </div>
    </FluidBottomSheet>
  );
};
