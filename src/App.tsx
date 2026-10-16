/**
 * src/App.tsx
 *
 * Componente Raiz e Orquestrador da SPA Taiada Fiscaliza ("Cobra, Taiada!").
 *
 * Responsabilidades:
 * 1. Prover o AppPreferencesProvider para toda a árvore de componentes.
 * 2. Carregar chamados e dossiês de rua via GET /api/issues na inicialização.
 * 3. Suportar deep-linking com foco automático via window.__INITIAL_ISSUE_ID__ (ou rota /c/:id).
 * 4. Orquestrar estados de visualização (Mapa vs Lista), filtros de categoria e busca.
 * 5. Gerenciar abertura/fechamento das gavetas fluidas e modais:
 *    - MapCanvas & IssueListView
 *    - FluidBottomSheet & CreateIssueSheet
 *    - IssueDetailSheet & StreetDossierDrawer
 *    - WhatsAppShareModal & OfficialDocumentModal
 *    - SettingsModal & AdminModerationModal
 *    - PrivacyBanner
 * 6. Exibir botão flutuante principal (+ Cobra, Taiada! Registrar Problema) com feedback tátil Apple.
 * 7. Prover sistema tátil de notificações (toasts) para feedback em tempo real.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import {
  AppPreferencesProvider,
  useAppPreferences,
} from './context/AppPreferencesContext';
import { HeaderBar } from './components/HeaderBar';
import { PrivacyBanner } from './components/PrivacyBanner';
import { SettingsModal } from './components/SettingsModal';
import { MapCanvas } from './components/MapCanvas';
import { CreateIssueSheet } from './components/CreateIssueSheet';
import { IssueDetailSheet } from './components/IssueDetailSheet';
import { StreetDossierDrawer } from './components/StreetDossierDrawer';
import { WhatsAppShareModal } from './components/WhatsAppShareModal';
import { OfficialDocumentModal } from './components/OfficialDocumentModal';
import { AdminModerationModal } from './components/AdminModerationModal';
import {
  Issue,
  StreetDossier,
  GlobalStats,
  IssueCategory,
  DuplicateCandidate,
  ViewMode,
} from './shared/types';

// Declaração de variável global injetada pelo SSR do Express
declare global {
  interface Window {
    __INITIAL_ISSUE_ID__?: string;
  }
}

// Interface para mensagens de feedback tátil (toasts)
export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

const AppContent: React.FC = () => {
  const { brandConfig, theme, dataSaverMode, defaultView, setDefaultView } = useAppPreferences();

  // Estados Principais de Dados da API
  const [issues, setIssues] = useState<Issue[]>([]);
  const [streetDossiers, setStreetDossiers] = useState<StreetDossier[]>([]);
  const [, setStats] = useState<GlobalStats>({
    total_issues: 0,
    resolved_issues: 0,
    total_upvotes: 0,
    active_dossiers: 0,
  });
  const [deviceHashShort, setDeviceHashShort] = useState<string>('anônimo');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Estados de Filtros e Visualização
  const [currentView, setCurrentView] = useState<ViewMode>(defaultView);
  const [selectedCategory, setSelectedCategory] = useState<IssueCategory | 'all'>('all');

  // Sincroniza visualização padrão quando alterada pelo contexto
  useEffect(() => {
    setCurrentView(defaultView);
  }, [defaultView]);

  // Estados de Seleção e Abertura de Sheets / Modais
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedDossier, setSelectedDossier] = useState<StreetDossier | null>(null);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);

  // Modais de Ação Compartilhada
  const [shareTarget, setShareTarget] = useState<{
    issue?: Issue | null;
    dossier?: StreetDossier | null;
  } | null>(null);

  const [documentTarget, setDocumentTarget] = useState<{
    issue?: Issue | null;
    dossier?: StreetDossier | null;
  } | null>(null);

  // Sistema de Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastMessage['type'] = 'success') => {
      const id = `${Date.now()}_${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Busca dados de GET /api/issues
  const loadIssuesData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/issues');
      if (!res.ok) {
        throw new Error(`Falha ao obter demandas (${res.status})`);
      }
      const data = await res.json();
      const loadedIssues: Issue[] = data.issues || [];
      const loadedDossiers: StreetDossier[] = data.street_dossiers || [];
      setIssues(loadedIssues);
      setStreetDossiers(loadedDossiers);
      setDeviceHashShort(data.device_hash_short || 'anônimo');
      if (data.stats) {
        setStats({
          total_issues: data.stats.total_issues || loadedIssues.length || 0,
          resolved_issues: data.stats.total_resolved || 0,
          total_upvotes: data.stats.total_supporters || 0,
          active_dossiers: loadedDossiers.length || 0,
        });
      }
      return loadedIssues;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setFetchError(msg);
      addToast('Não foi possível conectar ao servidor de Caçapava.', 'error');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  // Carrega na montagem
  useEffect(() => {
    loadIssuesData();
  }, [loadIssuesData]);

  // Trata Deep-Linking via window.__INITIAL_ISSUE_ID__ ou URL /c/:id
  useEffect(() => {
    if (isLoading) return;

    let targetId: string | null = null;

    if (typeof window !== 'undefined') {
      if (window.__INITIAL_ISSUE_ID__) {
        targetId = window.__INITIAL_ISSUE_ID__;
      } else {
        const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/i);
        if (match && match[1]) {
          targetId = match[1].toUpperCase();
        }
      }
    }

    if (targetId) {
      const found = issues.find((i) => i.id.toUpperCase() === targetId?.toUpperCase());
      if (found) {
        setSelectedIssue(found);
        setCurrentView('map');
        addToast(`Foco no protocolo ${found.id}`, 'info');
      } else {
        // Tenta carregar sob demanda via /api/issues/:id
        fetch(`/api/issues/${targetId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((detail) => {
            if (detail && detail.issue) {
              setSelectedIssue(detail.issue);
              setCurrentView('map');
              addToast(`Foco no protocolo ${detail.issue.id}`, 'info');
            }
          })
          .catch(() => {});
      }
    }
  }, [isLoading, issues, addToast]);

  // Contagem de demandas ativas (open, verifying_resolution, reopened)
  const totalActive = useMemo(() => {
    return issues.filter(
      (i) =>
        i.resolution_status === 'open' ||
        i.resolution_status === 'verifying_resolution' ||
        i.resolution_status === 'reopened'
    ).length;
  }, [issues]);

  // Callback de sucesso ao criar chamado
  const handleIssueCreated = useCallback(
    (created: Issue) => {
      addToast(`Protocolo ${created.id} registrado com sucesso!`, 'success');
      loadIssuesData().then((updatedList) => {
        const found = updatedList.find((i) => i.id === created.id) || created;
        setSelectedIssue(found);
      });
    },
    [addToast, loadIssuesData]
  );

  // Callback de fusão / apoio em duplicata identificada (Opção A — Seção 3.2 do PRD)
  const handleDuplicateContribution = useCallback(
    (candidate: DuplicateCandidate) => {
      setIsCreateSheetOpen(false);
      addToast(`Apoio somado ao protocolo ${candidate.id}! Compartilhe no WhatsApp.`, 'success');
      loadIssuesData().then((updatedList) => {
        const found = updatedList.find((i) => i.id === candidate.id) || issues.find((i) => i.id === candidate.id);
        if (found) {
          setSelectedIssue(found);
          setShareTarget({ issue: found });
        } else {
          fetch(`/api/issues/${candidate.id}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.issue) {
                setSelectedIssue(d.issue);
                setShareTarget({ issue: d.issue });
              }
            })
            .catch(() => {});
        }
      });
    },
    [issues, addToast, loadIssuesData]
  );

  // Callback ao selecionar ponto dentro de um dossiê
  const handleSelectDossierPoint = useCallback(
    (issueId: string) => {
      const found = issues.find((i) => i.id === issueId);
      if (found) {
        setSelectedIssue(found);
      }
    },
    [issues]
  );

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden flex flex-col bg-taiada-lightBg dark:bg-taiada-darkBg text-taiada-dark dark:text-taiada-lightBg font-sans">
      {/* 1. Cabeçalho Translúcido Flutuante */}
      <HeaderBar
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          setDefaultView(view);
        }}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        totalActiveIssues={totalActive}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onResetView={() => {
          setSelectedIssue(null);
          setSelectedDossier(null);
          setSelectedCategory('all');
        }}
      />

      {/* 2. Área Central de Visualização (Mapa Leaflet ou Lista de Bairros) */}
      <main className="relative flex-1 w-full h-full pt-24 pb-0 overflow-hidden">
        {isLoading && issues.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-taiada-primary animate-spin" />
            <p className="text-xs font-semibold text-gray-500">
              Carregando mapa de zeladoria de Caçapava...
            </p>
          </div>
        ) : fetchError && issues.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              Erro ao carregar os dados
            </p>
            <p className="text-xs text-gray-500 max-w-xs">{fetchError}</p>
            <button
              onClick={loadIssuesData}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-taiada-primary text-white active:scale-95 transition-all"
            >
              Tentar Novamente
            </button>
          </div>
        ) : (
          <MapCanvas
            issues={issues}
            streetDossiers={streetDossiers}
            selectedCategory={selectedCategory}
            selectedIssueId={selectedIssue ? selectedIssue.id : null}
            selectedDossierKey={selectedDossier ? selectedDossier.street_group_key : null}
            viewMode={currentView}
            theme={theme}
            dataSaverMode={dataSaverMode}
            onSelectIssue={(issue) => {
              setSelectedIssue(issue);
            }}
            onSelectDossier={(dossier) => {
              setSelectedDossier(dossier);
            }}
            onCategoryFilterChange={setSelectedCategory}
            onToggleViewMode={setCurrentView}
          />
        )}

        {/* 3. Botão Flutuante Principal: + Cobra, Taiada! Registrar Problema */}
        <div
          className="fixed z-30 pointer-events-auto"
          style={{
            bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
            right: 'max(1rem, env(safe-area-inset-right))',
          }}
        >
          <button
            type="button"
            onClick={() => setIsCreateSheetOpen(true)}
            aria-label="Registrar novo problema"
            className="flex items-center gap-2 px-5 py-3.5 rounded-full font-bold text-sm bg-taiada-primary hover:bg-taiada-dark text-white shadow-xl shadow-taiada-primary/30 border border-white/20 active:scale-95 transition-all duration-150 ease-out select-none touch-manipulation group"
          >
            <Plus className="w-5 h-5 transition-transform group-hover:rotate-90 duration-200" />
            <span className="tracking-tight">{brandConfig.ctaLabel}</span>
          </button>
        </div>
      </main>

      {/* 4. Bottom Sheets Fluidos Apple */}
      {/* Wizard de Criação */}
      <CreateIssueSheet
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onSuccess={handleIssueCreated}
        onSelectDuplicateToContribute={handleDuplicateContribution}
      />

      {/* Ficha Técnica de Detalhes da Demanda */}
      <IssueDetailSheet
        issue={selectedIssue}
        isOpen={!!selectedIssue}
        onClose={() => setSelectedIssue(null)}
        onOpenShare={(issue) => setShareTarget({ issue })}
        onOpenDocument={(issue) => setDocumentTarget({ issue })}
        onVoteSuccess={loadIssuesData}
        dataSaverMode={dataSaverMode}
      />

      {/* Gaveta do Dossiê Coletivo da Via */}
      <StreetDossierDrawer
        dossier={selectedDossier}
        isOpen={!!selectedDossier}
        onClose={() => setSelectedDossier(null)}
        onSelectIssuePoint={handleSelectDossierPoint}
        onOpenDossierDocument={(dossier) => setDocumentTarget({ dossier })}
        onOpenDossierShare={(dossier) => setShareTarget({ dossier })}
      />

      {/* 5. Modais de Ação */}
      {/* Modal de Compartilhamento WhatsApp */}
      <WhatsAppShareModal
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
        issue={shareTarget?.issue}
        dossier={shareTarget?.dossier}
      />

      {/* Gerador de Ofício Cívico / Indicação Parlamentar (PDF/Impressão) */}
      <OfficialDocumentModal
        isOpen={!!documentTarget}
        onClose={() => setDocumentTarget(null)}
        issue={documentTarget?.issue}
        dossier={documentTarget?.dossier}
      />

      {/* Modal de Configurações */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        deviceHashShort={deviceHashShort}
      />

      {/* Painel Administrativo de Moderação */}
      <AdminModerationModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onDataChanged={loadIssuesData}
      />

      {/* Banner de Conformidade LGPD Zero-Tracker */}
      <PrivacyBanner />

      {/* 6. Toasts Flutuantes */}
      <div
        className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none px-4 w-full max-w-sm"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3 rounded-2xl shadow-xl backdrop-blur-xl border text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-150 ${
              toast.type === 'error'
                ? 'bg-red-950/90 text-red-200 border-red-500/30'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 text-amber-200 border-amber-500/30'
                : toast.type === 'info'
                ? 'bg-blue-950/90 text-blue-200 border-blue-500/30'
                : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              ) : toast.type === 'info' ? (
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppPreferencesProvider>
      <AppContent />
    </AppPreferencesProvider>
  );
}
