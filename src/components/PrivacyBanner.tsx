/**
 * src/components/PrivacyBanner.tsx
 *
 * Banner LGPD Discreto e Modal Informativo de Privacidade Zero-Tracker.
 * Diretrizes:
 * - Esclarece a filosofia Zero-Auth (sem cadastro, sem senha, sem CPF, sem rastreadores terceiros).
 * - Armazena o consentimento no LocalStorage sob a chave 'taiada_lgpd_consent_v1'.
 * - Modal acessível com transparência total sobre auditoria EXIF e Geofencing municipal.
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Check } from 'lucide-react';

const LGPD_STORAGE_KEY = 'taiada_lgpd_consent_v1';

export const PrivacyBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem(LGPD_STORAGE_KEY);
      if (!consent) {
        setIsVisible(true);
      }
    } catch {
      // Ignora erro
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(LGPD_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Ignora erro
    }
    setIsVisible(false);
  };

  if (!isVisible && !isModalOpen) return null;

  return (
    <>
      {/* Banner Discreto Flutuante no Rodapé */}
      {isVisible && (
        <aside
          aria-label="Aviso de Privacidade LGPD"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-200 select-none"
        >
          <div className="bg-white/95 dark:bg-[#15301d]/95 backdrop-blur-2xl rounded-2xl p-4 shadow-2xl border border-taiada-primary/20 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-taiada-primary/15 text-taiada-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                <p className="font-semibold text-taiada-dark dark:text-white mb-0.5">
                  Privacidade Cívica e Zero-Tracker
                </p>
                <p>
                  O Taiada Fiscaliza é 100% aberto e sem cadastro. Não utilizamos cookies
                  publicitários nem rastreadores. Apenas geramos um identificador anônimo
                  criptográfico para proteger Caçapava contra relatos duplicados.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-black/5 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-taiada-primary dark:text-[#a7c7b0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95 touch-manipulation"
              >
                Saber Mais
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-taiada-primary hover:bg-taiada-dark text-white shadow-sm shadow-taiada-primary/20 transition-all active:scale-95 touch-manipulation flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Entendido</span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Modal Completo de Termos e Privacidade LGPD */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-[#15301d] rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col shadow-2xl border border-taiada-primary/20 overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-taiada-primary" />
                <h3 className="text-base font-bold text-taiada-dark dark:text-white">
                  Termos de Uso e Privacidade Cívica
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 text-gray-500 hover:text-black dark:text-gray-300 dark:hover:text-white active:scale-90 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo com Rolagem */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
              <section className="space-y-1">
                <h4 className="font-bold text-sm text-taiada-dark dark:text-white">
                  1. Princípio Zero-Auth (Sem Cadastro)
                </h4>
                <p>
                  Você não precisa fornecer nome completo, CPF, e-mail ou senha para registrar
                  problemas ou apoiar demandas em Caçapava - SP. Seu dispositivo recebe uma chave
                  criptográfica anônima (`taiada_device_token`), permitindo a contagem de votos e o
                  cálculo de consenso sem violar sua privacidade.
                </p>
              </section>

              <section className="space-y-1">
                <h4 className="font-bold text-sm text-taiada-dark dark:text-white">
                  2. Sanitização de Fotos e Remoção EXIF
                </h4>
                <p>
                  Todas as fotos enviadas passam por processamento automático em memória pelo servidor.
                  Qualquer metadado pessoal de hardware, número de série da câmera ou miniatura oculta
                  é 100% apagado antes do arquivo ser disponibilizado publicamente em formato WebP.
                  Apenas as coordenadas de latitude/longitude são conferidas internamente para auditar
                  que a foto foi tirada dentro de Caçapava.
                </p>
              </section>

              <section className="space-y-1">
                <h4 className="font-bold text-sm text-taiada-dark dark:text-white">
                  3. Delimitação Exclusiva (Caçapava - SP)
                </h4>
                <p>
                  O serviço opera com trava de geofencing restrita aos limites municipais de Caçapava
                  (IBGE 3508504). Relatos com coordenadas fora do município são recusados
                  automaticamente para garantir o foco da zeladoria comunitária local.
                </p>
              </section>

              <section className="space-y-1">
                <h4 className="font-bold text-sm text-taiada-dark dark:text-white">
                  4. Finalidade Pública e Código Aberto
                </h4>
                <p>
                  As informações reunidas nesta plataforma têm propósito estritamente cívico,
                  colaborativo e de fiscalização da administração pública. O código-fonte é aberto sob
                  a licença MIT, auditável por qualquer munícipe.
                </p>
              </section>
            </div>

            {/* Rodapé com Botão de Confirmação */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-black/20 border-t border-black/10 dark:border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  handleAccept();
                  setIsModalOpen(false);
                }}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-taiada-primary hover:bg-taiada-dark text-white shadow-md shadow-taiada-primary/20 active:scale-95 transition-all touch-manipulation"
              >
                Concordar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
