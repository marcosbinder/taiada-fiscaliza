/**
 * src/components/AdminModerationModal.tsx
 *
 * Painel Administrativo e de Moderação do Taiada Fiscaliza ("Cobra, Taiada!").
 * Protegido via ADMIN_TOKEN.
 *
 * Funcionalidades:
 * 1. Fila de demandas retidas (pending_review) por trust_score < 60.
 * 2. Aprovação / Rejeição de demandas.
 * 3. Vinculação de Protocolo Oficial (Gabinete do Prefeito / Câmara).
 * 4. Expurgo em 1 Clique (72h) com Shadowban e recálculo automático de consenso.
 * 5. Visão geral de métricas do sistema.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileCheck,
  Key,
  Loader2,
  ShieldAlert,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { Issue, ModerationStatus, OfficialStatus } from '../shared/types';

export interface AdminModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export const AdminModerationModal: React.FC<AdminModerationModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const [token, setToken] = useState(() => sessionStorage.getItem('taiada_admin_token') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'protocol' | 'purge' | 'metrics'>('pending');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dados administrativos carregados
  const [pendingIssues, setPendingIssues] = useState<Issue[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  // Formulário de protocolo oficial
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [protocolNumber, setProtocolNumber] = useState('');
  const [officialStatus, setOfficialStatus] = useState<OfficialStatus>('protocolled');

  // Formulário de expurgo
  const [purgeTargetHash, setPurgeTargetHash] = useState('');
  const [purgeReason, setPurgeReason] = useState('Spam ou abuso comprovado');
  const [purgeResultMsg, setPurgeResultMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });

      if (!res.ok) {
        throw new Error('Token administrativo inválido.');
      }

      const data = await res.json();
      sessionStorage.setItem('taiada_admin_token', token.trim());
      setIsAuthenticated(true);
      setPendingIssues(data.pending_moderation || []);
      setMetrics(data.metrics || {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleModerate = async (id: string, status: ModerationStatus) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/moderation/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ moderation_status: status }),
      });

      if (!res.ok) throw new Error('Falha ao atualizar status.');

      setPendingIssues((prev) => prev.filter((item) => item.id !== id));
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBindProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssueId.trim() || !protocolNumber.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/moderation/${selectedIssueId.trim()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          official_protocol_number: protocolNumber.trim(),
          official_status: officialStatus,
        }),
      });

      if (!res.ok) throw new Error('Falha ao vincular protocolo oficial.');

      setSelectedIssueId('');
      setProtocolNumber('');
      alert('Protocolo oficial vinculado com sucesso!');
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeDevice = async () => {
    if (!purgeTargetHash.trim()) return;
    if (!confirm(`CONFIRMAÇÃO CRÍTICA:\nDeseja expurgar todos os relatos, votos e fotos do dispositivo "${purgeTargetHash}" nas últimas 72h e aplicar Shadowban definitivo?`)) {
      return;
    }

    setLoading(true);
    setPurgeResultMsg(null);
    try {
      const res = await fetch('/api/admin/purge-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device_hash: purgeTargetHash.trim(),
          reason: purgeReason.trim(),
          mode: 'purge_and_shadowban',
        }),
      });

      if (!res.ok) throw new Error('Falha ao executar expurgo.');

      const result = await res.json();
      setPurgeResultMsg(
        `Expurgo concluído! ${result.purged_issues_count} relatos, ${result.purged_votes_count} votos e ${result.purged_contributions_count} fotos removidos. ${result.recalculated_issues_count} chamados recalculados.`
      );
      setPurgeTargetHash('');
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-3xl bg-white dark:bg-taiada-darkBg rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-taiada-primary" />
            <h2 className="text-lg font-black text-taiada-dark dark:text-white">
              Gabinete & Moderação • Taiada Fiscaliza
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tela de Login caso não autenticado */}
        {!isAuthenticated ? (
          <form onSubmit={handleLogin} className="space-y-4 py-6 max-w-sm mx-auto">
            <div className="text-center">
              <Key className="w-10 h-10 mx-auto text-taiada-primary mb-2" />
              <h3 className="font-bold text-sm text-taiada-dark dark:text-white">
                Informe o Token de Administração
              </h3>
              <p className="text-xs text-gray-400">Variável ADMIN_TOKEN do servidor</p>
            </div>

            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Digite o ADMIN_TOKEN..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
            />

            {errorMsg && (
              <p className="text-xs text-red-500 text-center font-medium">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-taiada-primary text-white font-bold rounded-xl shadow-md hover:bg-taiada-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar no Gabinete'}
            </button>
          </form>
        ) : (
          /* Conteúdo Administrativo Autenticado */
          <div className="space-y-4">
            {/* Navegação por Abas */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 text-xs font-semibold gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`pb-2.5 px-3 border-b-2 transition-all ${
                  activeTab === 'pending'
                    ? 'border-taiada-primary text-taiada-primary font-bold'
                    : 'border-transparent text-gray-400'
                }`}
              >
                Fila de Revisão ({pendingIssues.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('protocol')}
                className={`pb-2.5 px-3 border-b-2 transition-all ${
                  activeTab === 'protocol'
                    ? 'border-taiada-primary text-taiada-primary font-bold'
                    : 'border-transparent text-gray-400'
                }`}
              >
                Vincular Protocolo Oficial
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('purge')}
                className={`pb-2.5 px-3 border-b-2 transition-all ${
                  activeTab === 'purge'
                    ? 'border-red-600 text-red-600 font-bold'
                    : 'border-transparent text-gray-400'
                }`}
              >
                Expurgo 72h / Shadowban
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('metrics')}
                className={`pb-2.5 px-3 border-b-2 transition-all ${
                  activeTab === 'metrics'
                    ? 'border-taiada-primary text-taiada-primary font-bold'
                    : 'border-transparent text-gray-400'
                }`}
              >
                Métricas
              </button>
            </div>

            {/* ABA 1: Fila de Moderação (pending_review) */}
            {activeTab === 'pending' && (
              <div className="space-y-3">
                {pendingIssues.length === 0 ? (
                  <p className="text-center py-8 text-xs text-gray-400">
                    Nenhum relato pendente de revisão. Todos os chamados com trust_score &gt;= 60 foram
                    aprovados automaticamente.
                  </p>
                ) : (
                  pendingIssues.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-taiada-dark/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold text-taiada-primary">
                            {item.id}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                            Trust: {item.trust_score}/100
                          </span>
                          <span className="text-xs text-gray-400">
                            Hash: {item.device_hash.slice(0, 8)}...
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-taiada-dark dark:text-white">
                          {item.title}
                        </h4>
                        <p className="text-xs text-gray-500">
                          {item.street_name}, {item.neighborhood}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleModerate(item.id, 'approved')}
                          className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center gap-1 hover:bg-emerald-700"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleModerate(item.id, 'rejected')}
                          className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-xl text-xs flex items-center gap-1 hover:bg-red-700"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ABA 2: Protocolo Oficial */}
            {activeTab === 'protocol' && (
              <form onSubmit={handleBindProtocol} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    ID do Chamado (ex: TAI-2026-0101):
                  </label>
                  <input
                    type="text"
                    value={selectedIssueId}
                    onChange={(e) => setSelectedIssueId(e.target.value)}
                    placeholder="TAI-2026-XXXX"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Número do Protocolo da Prefeitura ou Câmara:
                  </label>
                  <input
                    type="text"
                    value={protocolNumber}
                    onChange={(e) => setProtocolNumber(e.target.value)}
                    placeholder="Ex: Indicação Nº 142/2026 - Gabinete Vereador"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Status Oficial:
                  </label>
                  <select
                    value={officialStatus}
                    onChange={(e) => setOfficialStatus(e.target.value as OfficialStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white"
                  >
                    <option value="received">Recebido</option>
                    <option value="triaged">Triado</option>
                    <option value="protocolled">Protocolado Oficialmente</option>
                    <option value="completed">Concluído</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="py-2.5 px-5 bg-taiada-primary text-white font-bold rounded-xl shadow-md hover:bg-taiada-dark transition-all text-xs flex items-center gap-1.5"
                >
                  <FileCheck className="w-4 h-4" />
                  Gravar Protocolo Oficial
                </button>
              </form>
            )}

            {/* ABA 3: Expurgo em 1 Clique e Shadowban */}
            {activeTab === 'purge' && (
              <div className="space-y-4 max-w-lg">
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Atenção: O expurgo remove em transação ACID todos os relatos, fotos e votos das últimas
                    72h emitidos pelo device_hash informado e ativa o Shadowban permanente.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Hash do Dispositivo Infrator (device_hash):
                  </label>
                  <input
                    type="text"
                    value={purgeTargetHash}
                    onChange={(e) => setPurgeTargetHash(e.target.value)}
                    placeholder="Cole o device_hash completo (32 caracteres)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark font-mono text-base text-taiada-dark dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Motivo do Expurgo:
                  </label>
                  <input
                    type="text"
                    value={purgeReason}
                    onChange={(e) => setPurgeReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white"
                  />
                </div>

                {purgeResultMsg && (
                  <p className="text-xs text-emerald-600 font-bold">{purgeResultMsg}</p>
                )}

                <button
                  type="button"
                  onClick={handlePurgeDevice}
                  disabled={loading || !purgeTargetHash.trim()}
                  className="py-3 px-6 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-all text-xs flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  ⚡ Executar Expurgo em 1 Clique (72h) + Shadowban
                </button>
              </div>
            )}

            {/* ABA 4: Métricas Gerais */}
            {activeTab === 'metrics' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
                  <span className="text-2xl font-black text-taiada-dark dark:text-white block">
                    {metrics.total_issues || 0}
                  </span>
                  <span className="text-xs text-gray-400">Total de Chamados</span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
                  <span className="text-2xl font-black text-taiada-primary block">
                    {metrics.approved_count || 0}
                  </span>
                  <span className="text-xs text-gray-400">Aprovados</span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
                  <span className="text-2xl font-black text-amber-500 block">
                    {metrics.pending_count || 0}
                  </span>
                  <span className="text-xs text-gray-400">Pendentes</span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
                  <span className="text-2xl font-black text-red-500 block">
                    {metrics.reopened_count || 0}
                  </span>
                  <span className="text-xs text-gray-400">Reabertos</span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
                  <span className="text-2xl font-black text-taiada-dark dark:text-white block">
                    {metrics.total_votes || 0}
                  </span>
                  <span className="text-xs text-gray-400">Total de Votos</span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 text-center">
                  <span className="text-2xl font-black text-gray-600 block">
                    {metrics.shadowbanned_devices_count || 0}
                  </span>
                  <span className="text-xs text-gray-400">Em Shadowban</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
