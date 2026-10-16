/**
 * src/components/WhatsAppShareModal.tsx
 *
 * Modal de Compartilhamento Viral no WhatsApp do Taiada Fiscaliza ("Cobra, Taiada!").
 * Formata texto natural em pt-BR adaptado aos grupos de moradores de Caçapava - SP.
 */

import React, { useState } from 'react';
import { Check, Copy, MessageCircle, Share2, X } from 'lucide-react';
import { Issue, StreetDossier } from '../shared/types';

export interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue?: Issue | null;
  dossier?: StreetDossier | null;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  issue,
  dossier,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || (!issue && !dossier)) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://taiadafiscaliza.com.br';
  const shareUrl = issue ? `${baseUrl}/c/${issue.id}` : `${baseUrl}`;

  // Montagem da mensagem formatada para WhatsApp
  let messageText = '';
  if (issue) {
    messageText = `🚨 *Atenção, vizinhos de Caçapava!*\n` +
      `📍 *${issue.neighborhood}* (${issue.street_name})\n` +
      `⚠️ *${issue.title}* (Gravidade ${issue.severity}/5)\n\n` +
      `Já temos *${issue.upvotes_count} moradores* cobrando providências!\n` +
      `Dá uma força lá no mapa cívico pra pressionar a Prefeitura e os vereadores:\n` +
      `🔗 ${shareUrl}\n\n` +
      `_(Não precisa baixar app nem criar cadastro, é só clicar e apoiar com 1 toque)_`;
  } else if (dossier) {
    messageText = `🚨 *Dossiê Coletivo da Via em Caçapava!*\n` +
      `📍 *${dossier.street_name}*\n` +
      `⚠️ *${dossier.category_label}*: já são *${dossier.issues_count} problemas graves* mapeados ao longo da via!\n\n` +
      `Já somamos *${dossier.total_upvotes} moradores afetados* cobrando a Secretaria de Obras.\n` +
      `Acesse para assinar e apoiar o ofício oficial:\n` +
      `🔗 ${shareUrl}\n\n` +
      `_(Apoio 100% gratuito e anônimo pelo Taiada Fiscaliza)_`;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(messageText);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-taiada-darkBg rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center shadow-md shadow-green-500/30">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-taiada-dark dark:text-white">
                Compartilhar no WhatsApp
              </h3>
              <p className="text-xs text-gray-400">Mobilização de Caçapava - SP</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Caixa de Texto Formatada */}
        <div className="bg-gray-50 dark:bg-taiada-dark/50 border border-gray-200 dark:border-gray-700/60 rounded-2xl p-3.5 text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
          {messageText}
        </div>

        {/* Botões de Ação */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="w-full py-3.5 bg-green-600 text-white font-bold rounded-2xl shadow-lg shadow-green-600/30 hover:bg-green-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Abrir Direto no WhatsApp
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full py-3 bg-gray-100 dark:bg-taiada-dark border border-gray-300 dark:border-gray-700 text-taiada-dark dark:text-white font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xs"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-green-600 font-bold">Mensagem Copiada!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copiar Texto da Mensagem
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
