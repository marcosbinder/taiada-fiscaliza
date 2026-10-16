/**
 * src/components/OfficialDocumentModal.tsx
 *
 * Gerador de Ofício Oficial / Minuta de Indicação Parlamentar do Taiada Fiscaliza ("Cobra, Taiada!").
 * Embasamento legal no Art. 5º, XXXIII e XXXIV da Constituição Federal e Lei de Acesso à Informação.
 * Renderiza QR Code vetorial SVG nativo direto no cliente sem nenhuma dependência ou API externa.
 * Estilizado com regras dedicadas de @media print para folha padrão A4.
 */

import React from 'react';
import { Printer, Shield, X } from 'lucide-react';
import { Issue, StreetDossier } from '../shared/types';
import { getCategoryDefinition, getSeverityDefinition } from '../shared/categories';
import { QrCodeSvg } from '../utils/qrCode';

export interface OfficialDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue?: Issue | null;
  dossier?: StreetDossier | null;
}

export const OfficialDocumentModal: React.FC<OfficialDocumentModalProps> = ({
  isOpen,
  onClose,
  issue,
  dossier,
}) => {
  if (!isOpen || (!issue && !dossier)) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://taiadafiscaliza.com.br';
  const shareUrl = issue ? `${baseUrl}/c/${issue.id}` : `${baseUrl}`;

  const todayStr = new Date().toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const categoryDef = issue
    ? getCategoryDefinition(issue.category)
    : dossier
    ? getCategoryDefinition(dossier.category)
    : null;

  const severityDef = issue ? getSeverityDefinition(issue.severity) : null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm p-2 sm:p-6 flex justify-center">
      <div className="relative w-full max-w-4xl bg-white text-black rounded-3xl shadow-2xl p-6 sm:p-10 my-auto border border-gray-200">
        {/* Barra Flutuante de Controle (Oculta na Impressão) */}
        <div className="no-print flex items-center justify-between pb-6 mb-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-taiada-primary" />
            <span className="font-bold text-sm text-taiada-dark">
              Minuta de Ofício / Indicação Parlamentar (Caçapava - SP)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-taiada-primary text-white font-bold rounded-xl shadow-md hover:bg-taiada-dark transition-all active:scale-95 flex items-center gap-2 text-xs"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar em PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CORPO DO DOCUMENTO FORMAL (IMPRESSÃO A4)                 */}
        {/* ======================================================== */}
        <div className="space-y-6 text-sm leading-relaxed text-black">
          {/* Cabeçalho Institucional */}
          <div className="border-b-2 border-taiada-dark pb-4 text-center space-y-1">
            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-taiada-dark to-taiada-primary flex items-center justify-center text-white mb-2 shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-black tracking-wider uppercase text-taiada-dark">
              MUNICÍPIO DE CAÇAPAVA — ESTADO DE SÃO PAULO
            </h1>
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-widest">
              Plataforma Cívica de Fiscalização Comunitária • Taiada Fiscaliza
            </h2>
            <p className="text-[11px] text-gray-500">
              Código IBGE: 3508504 • Zeladoria Urbana e Controle Social
            </p>
          </div>

          {/* Destinatários Oficiais */}
          <div className="pt-2">
            <p className="font-bold">
              AO EXCELENTÍSSIMO SENHOR PREFEITO MUNICIPAL DE CAÇAPAVA - SP
            </p>
            <p className="text-xs text-gray-700">
              Secretaria Municipal de Obras e Serviços Públicos
            </p>
            <p className="font-bold mt-2">
              À MESA DIRETORA E SENHORES(AS) VEREADORES(AS) DA CÂMARA MUNICIPAL DE CAÇAPAVA
            </p>
          </div>

          {/* Identificação do Ofício e Assunto */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-xs font-bold uppercase text-gray-500 block">
                Protocolo Cívico Auditável:
              </span>
              <span className="text-base font-black font-mono text-taiada-dark">
                {issue ? issue.id : `DOSSIE-${dossier?.street_group_key}`}
              </span>
              <span className="text-xs text-gray-600 block mt-0.5">
                Emissão em: {todayStr} • Caçapava - SP
              </span>
            </div>

            {/* QR Code Vetorial SVG Nativo Gerado no Cliente */}
            <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-gray-200">
              <QrCodeSvg value={shareUrl} size={70} color="#15301d" />
              <div className="text-[10px] text-gray-500 max-w-[130px] leading-tight">
                Aponte a câmera para auditar no mapa e verificar o histórico ao vivo.
              </div>
            </div>
          </div>

          {/* Quadro Técnico da Demanda */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wide border-b border-gray-200 pb-1">
              1. Identificação Técnica da Demanda
            </h3>

            {issue && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <strong className="text-gray-600">Categoria:</strong>{' '}
                  <span>{categoryDef?.label}</span>
                </div>
                <div>
                  <strong className="text-gray-600">Grau de Urgência:</strong>{' '}
                  <span className="font-bold" style={{ color: severityDef?.color }}>
                    Nível {issue.severity}/5 ({severityDef?.label})
                  </span>
                </div>
                <div>
                  <strong className="text-gray-600">Logradouro:</strong>{' '}
                  <span>{issue.street_name}</span>
                </div>
                <div>
                  <strong className="text-gray-600">Bairro:</strong>{' '}
                  <span>{issue.neighborhood}</span>
                </div>
                {issue.reference_point && (
                  <div className="col-span-2">
                    <strong className="text-gray-600">Ponto de Referência:</strong>{' '}
                    <span>{issue.reference_point}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <strong className="text-gray-600">Coordenadas Geodésicas GPS:</strong>{' '}
                  <span className="font-mono">
                    Lat: {issue.latitude.toFixed(6)}, Lng: {issue.longitude.toFixed(6)}
                  </span>
                </div>
              </div>
            )}

            {dossier && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <strong className="text-gray-600">Categoria Agrupada:</strong>{' '}
                  <span>{categoryDef?.label}</span>
                </div>
                <div>
                  <strong className="text-gray-600">Total de Ocorrências na Via:</strong>{' '}
                  <span className="font-bold">{dossier.issues_count} pontos mapeados</span>
                </div>
                <div className="col-span-2">
                  <strong className="text-gray-600">Logradouro Consolidado:</strong>{' '}
                  <span>{dossier.street_name}</span>
                </div>
              </div>
            )}
          </div>

          {/* Relatório Comunitário e Prova Social */}
          <div className="space-y-2">
            <h3 className="font-bold text-sm uppercase tracking-wide border-b border-gray-200 pb-1">
              2. Consenso Comunitário e Apoio Popular
            </h3>
            <p className="text-xs">
              Este registro foi auditado pela plataforma comunitária e conta com a manifestação
              formal de{' '}
              <strong>{issue ? issue.upvotes_count : dossier?.total_upvotes} munícipes</strong> de
              Caçapava atestando a urgência da intervenção do Poder Público.
            </p>
            {issue?.reopened_count ? (
              <p className="text-xs font-bold text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                Atenção: Este problema é reincidente e já foi reaberto {issue.reopened_count} vez(es)
                após tentativa anterior de reparo insatisfatória.
              </p>
            ) : null}
          </div>

          {/* Anexo Fotográfico com Carimbo de Auditoria */}
          {issue?.photo_url && (
            <div className="space-y-2">
              <h3 className="font-bold text-sm uppercase tracking-wide border-b border-gray-200 pb-1">
                3. Registro Fotográfico Auditado
              </h3>
              <div className="flex gap-4 items-start">
                <img
                  src={issue.photo_url}
                  alt="Anexo Fotográfico"
                  className="w-48 h-36 object-cover rounded-xl border border-gray-300"
                />
                <div className="text-xs space-y-1 text-gray-700">
                  <p>
                    <strong>Carimbo EXIF:</strong>{' '}
                    {issue.exif_captured_at
                      ? new Date(issue.exif_captured_at).toLocaleString('pt-BR')
                      : 'Data auditada pelo sistema'}
                  </p>
                  <p>
                    <strong>Verificação de Presença:</strong>{' '}
                    {issue.exif_verified_local === 1
                      ? 'Local e data confirmados no perímetro da ocorrência'
                      : 'Foto fornecida por cidadão local'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Embasamento Legal e Fechamento */}
          <div className="pt-4 border-t border-gray-300 text-[11px] text-gray-600 space-y-1">
            <p>
              Fundamentação Legal: Constituição Federal, Art. 5º, incisos XXXIII e XXXIV (Direito de
              Petição e Obtenção de Certidões junto aos Poderes Públicos) e Lei Federal nº
              12.527/2011 (Lei de Acesso à Informação).
            </p>
            <p className="pt-2 font-bold text-gray-800 text-center">
              Comunidade Caçapavense — Taiada Fiscaliza (&quot;Cobra, Taiada!&quot;)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
