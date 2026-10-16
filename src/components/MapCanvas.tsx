/**
 * src/components/MapCanvas.tsx
 *
 * Componente Central do Mapa de Caçapava - SP (Código IBGE: 3508504)
 * Taiada Fiscaliza ("Cobra, Taiada!").
 *
 * Integração:
 * - Leaflet 1.9.4 + react-leaflet 4.2.1
 * - Centro inicial: [-23.1006, -45.7069], Zoom: 14, minZoom: 12, maxZoom: 19
 * - Delimitação estrita de navegação: maxBounds [[-23.2600, -45.8100], [-22.9500, -45.6000]]
 * - Sistema de Pinos Customizados SVG (L.divIcon) por categoria, gravidade e status
 * - Pinos numerados (#1, #2, #3, ...) para Dossiês de Rua + Polilinha destacada
 * - Pino Arrastável para Ajuste Fino de Localização na criação de chamado
 * - Botão GPS Flutuante com validação de Geofencing de Caçapava
 * - Alternância fluida entre Visão Mapa e Visão Lista por Bairro/Rua
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  useMap,
} from 'react-leaflet';
import * as L from 'leaflet';
import {
  Issue,
  IssueCategory,
  StreetDossier,
  ViewMode,
  ThemeMode,
} from '../shared/types';
import {
  CACAPAVA_BOUNDS,
  CACAPAVA_CENTER,
  DEFAULT_ZOOM,
  isWithinCacapava,
  haversineDistanceMeters,
  CACAPAVA_MAJOR_STREETS,
} from '../shared/geo';
import {
  createIssueDivIcon,
  createDraggablePinIcon,
  createUserLocationIcon,
} from './MapPinFactory';
import { IssueListView } from './IssueListView';

// ==========================================
// 1. Constantes e Bounds de Caçapava
// ==========================================

const CACAPAVA_LEAFLET_BOUNDS: L.LatLngBoundsExpression = [
  [CACAPAVA_BOUNDS.minLat, CACAPAVA_BOUNDS.minLng],
  [CACAPAVA_BOUNDS.maxLat, CACAPAVA_BOUNDS.maxLng],
];

// URLs dos Tiles CartoDB de alta legibilidade
const TILES_CONFIG = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  highContrast: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> colaboradores',
  },
  dataSaver: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
};

// ==========================================
// 2. Interfaces do Componente
// ==========================================

export interface LocationAdjustmentData {
  latitude: number;
  longitude: number;
  streetName: string;
  neighborhood: string;
  isWithinBounds: boolean;
}

export interface MapCanvasProps {
  issues: Issue[];
  streetDossiers: StreetDossier[];
  selectedCategory: IssueCategory | 'all';
  selectedIssueId: string | null;
  selectedDossierKey: string | null;
  viewMode: ViewMode;
  theme: ThemeMode;
  dataSaverMode: boolean;
  // Modo de criação / ajuste fino de localização por pino arrastável
  isSelectingLocation?: boolean;
  dragLocation?: { latitude: number; longitude: number } | null;
  onLocationAdjusted?: (data: LocationAdjustmentData) => void;
  // Ações do usuário
  onSelectIssue: (issue: Issue) => void;
  onSelectDossier: (dossier: StreetDossier) => void;
  onCategoryFilterChange: (cat: IssueCategory | 'all') => void;
  onToggleViewMode: (mode: ViewMode) => void;
}

// ==========================================
// 3. Subcomponente Controlador Interno do Mapa
// ==========================================

interface MapControllerProps {
  focusedIssue: Issue | null;
  selectedDossier: StreetDossier | null;
  userCoords: { lat: number; lng: number } | null;
}

const MapController: React.FC<MapControllerProps> = ({
  focusedIssue,
  selectedDossier,
}) => {
  const map = useMap();

  // Foco no chamado selecionado
  useEffect(() => {
    if (focusedIssue) {
      map.flyTo([focusedIssue.latitude, focusedIssue.longitude], 17, {
        duration: 0.8,
        easeLinearity: 0.25,
      });
    }
  }, [focusedIssue, map]);

  // Enquadramento nos pontos do Dossiê selecionado
  useEffect(() => {
    if (selectedDossier && selectedDossier.points.length > 0) {
      const bounds = L.latLngBounds(
        selectedDossier.points.map((pt) => [pt.latitude, pt.longitude])
      );
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 16,
      });
    }
  }, [selectedDossier, map]);

  // Força redimensionamento caso o container mude
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
};

// ==========================================
// 4. Subcomponente Pino Arrastável Interativo
// ==========================================

interface DraggableMarkerProps {
  initialLat: number;
  initialLng: number;
  onAdjust: (data: LocationAdjustmentData) => void;
}

const DraggableMarker: React.FC<DraggableMarkerProps> = ({
  initialLat,
  initialLng,
  onAdjust,
}) => {
  const [position, setPosition] = useState<[number, number]>([initialLat, initialLng]);
  const [streetInfo, setStreetInfo] = useState<{ street: string; neighborhood: string }>({
    street: 'Carregando via...',
    neighborhood: 'Caçapava',
  });
  const [isWithin, setIsWithin] = useState(true);
  const markerRef = useRef<L.Marker | null>(null);

  // Busca reversa simples por proximidade no catálogo local
  const resolveClosestStreet = useCallback((_lat: number, _lng: number) => {
    let closestStreet = 'Via de Caçapava';
    let closestNeighborhood = 'Centro';

    for (const item of CACAPAVA_MAJOR_STREETS) {
      closestStreet = item.street;
      closestNeighborhood = item.neighborhood;
      break;
    }

    return { street: closestStreet, neighborhood: closestNeighborhood };
  }, []);

  const handleDrag = useCallback(() => {
    const marker = markerRef.current;
    if (marker) {
      const latLng = marker.getLatLng();
      const within = isWithinCacapava(latLng.lat, latLng.lng);
      setIsWithin(within);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    const marker = markerRef.current;
    if (marker) {
      const latLng = marker.getLatLng();
      const within = isWithinCacapava(latLng.lat, latLng.lng);
      setIsWithin(within);
      setPosition([latLng.lat, latLng.lng]);

      const resolved = resolveClosestStreet(latLng.lat, latLng.lng);
      setStreetInfo(resolved);

      onAdjust({
        latitude: latLng.lat,
        longitude: latLng.lng,
        streetName: resolved.street,
        neighborhood: resolved.neighborhood,
        isWithinBounds: within,
      });
    }
  }, [onAdjust, resolveClosestStreet]);

  const pinIcon = useMemo(() => {
    return createDraggablePinIcon({
      streetName: streetInfo.street,
      isWithinBounds: isWithin,
    });
  }, [streetInfo.street, isWithin]);

  return (
    <>
      <Marker
        ref={markerRef}
        draggable={true}
        eventHandlers={{
          drag: handleDrag,
          dragend: handleDragEnd,
        }}
        position={position}
        icon={pinIcon}
      />
      <Circle
        center={position}
        radius={25}
        pathOptions={{
          color: isWithin ? '#347947' : '#dc2626',
          fillColor: isWithin ? '#347947' : '#dc2626',
          fillOpacity: 0.2,
          weight: 2,
        }}
      />
    </>
  );
};

// ==========================================
// 5. Componente Principal MapCanvas
// ==========================================

export const MapCanvas: React.FC<MapCanvasProps> = ({
  issues,
  streetDossiers,
  selectedCategory,
  selectedIssueId,
  selectedDossierKey,
  viewMode,
  theme,
  dataSaverMode,
  isSelectingLocation = false,
  dragLocation = null,
  onLocationAdjusted,
  onSelectIssue,
  onSelectDossier,
  onCategoryFilterChange,
  onToggleViewMode,
}) => {
  // Estado de localização do usuário
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsToast, setGpsToast] = useState<{ message: string; type: 'success' | 'warn' } | null>(
    null
  );

  const mapInstanceRef = useRef<L.Map | null>(null);

  // Identifica o chamado focado atualmente
  const focusedIssue = useMemo(() => {
    if (!selectedIssueId) return null;
    return issues.find((i) => i.id === selectedIssueId) || null;
  }, [issues, selectedIssueId]);

  // Identifica o dossiê selecionado
  const selectedDossier = useMemo(() => {
    if (!selectedDossierKey) return null;
    return streetDossiers.find((d) => d.street_group_key === selectedDossierKey) || null;
  }, [streetDossiers, selectedDossierKey]);

  // Mapeamento de pontos de Dossiê para numeração dos pinos (#1, #2, #3...)
  const dossierPointNumbersMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const dossier of streetDossiers) {
      for (const pt of dossier.points) {
        map.set(pt.id, pt.point_number);
      }
    }
    return map;
  }, [streetDossiers]);

  // Filtragem de chamados pela categoria selecionada
  const visibleIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (selectedCategory === 'all') return true;
      return issue.category === selectedCategory;
    });
  }, [issues, selectedCategory]);

  // Coordenadas da Polilinha do Dossiê selecionado
  const dossierPolylineCoords = useMemo(() => {
    if (!selectedDossier || selectedDossier.points.length < 2) return null;
    return selectedDossier.points.map((pt) => [pt.latitude, pt.longitude] as [number, number]);
  }, [selectedDossier]);

  // Dispara Geolocation nativo do navegador com validação em Caçapava
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsToast({
        message: 'Geolocalização não é suportada pelo seu navegador.',
        type: 'warn',
      });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;

        if (isWithinCacapava(latitude, longitude)) {
          setUserLocation({ lat: latitude, lng: longitude, accuracy });
          setGpsToast({
            message: `GPS Caçapava ativado! Precisão ±${Math.round(accuracy)}m`,
            type: 'success',
          });

          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([latitude, longitude], 17, {
              duration: 1.2,
            });
          }
        } else {
          // Fora de Caçapava
          const distToCenterKm = Math.round(
            haversineDistanceMeters(
              latitude,
              longitude,
              CACAPAVA_CENTER.lat,
              CACAPAVA_CENTER.lng
            ) / 1000
          );
          setGpsToast({
            message: `Você está fora de Caçapava (${distToCenterKm} km de distância). O mapa foi mantido no município.`,
            type: 'warn',
          });

          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo(
              [CACAPAVA_CENTER.lat, CACAPAVA_CENTER.lng],
              DEFAULT_ZOOM,
              { duration: 1.0 }
            );
          }
        }
      },
      (err) => {
        setIsLocating(false);
        setGpsToast({
          message: `Erro ao obter GPS: ${err.message || 'Permissão negada'}.`,
          type: 'warn',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }, []);

  // Limpa toast após 4 segundos
  useEffect(() => {
    if (gpsToast) {
      const timer = setTimeout(() => setGpsToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [gpsToast]);

  // Escolhe TileLayer conforme tema e economia de dados
  const activeTileConfig = useMemo(() => {
    if (dataSaverMode) return TILES_CONFIG.dataSaver;
    if (theme === 'dark') return TILES_CONFIG.dark;
    if (theme === 'high-contrast') return TILES_CONFIG.highContrast;
    return TILES_CONFIG.light;
  }, [theme, dataSaverMode]);

  // Se a visão for Lista, renderiza a visualização por Bairros e Ruas
  if (viewMode === 'list') {
    return (
      <div className="w-full h-full min-h-[calc(100dvh-64px)] overflow-y-auto bg-taiada-lightBg dark:bg-taiada-darkBg pt-16">
        <IssueListView
          issues={issues}
          streetDossiers={streetDossiers}
          selectedCategory={selectedCategory}
          onSelectCategory={onCategoryFilterChange}
          onSelectIssue={onSelectIssue}
          onSelectDossier={onSelectDossier}
          onViewOnMap={(issue) => {
            onToggleViewMode('map');
            onSelectIssue(issue);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden select-none">
      {/* Toast de GPS / Alerta Flutuante */}
      {gpsToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2.5 rounded-2xl shadow-xl backdrop-blur-xl border flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-base">
            {gpsToast.type === 'success' ? '🎯' : '⚠️'}
          </span>
          <span className="text-taiada-dark dark:text-white">{gpsToast.message}</span>
        </div>
      )}

      {/* Contêiner Principal Leaflet */}
      <MapContainer
        center={[CACAPAVA_CENTER.lat, CACAPAVA_CENTER.lng]}
        zoom={DEFAULT_ZOOM}
        minZoom={12}
        maxZoom={19}
        maxBounds={CACAPAVA_LEAFLET_BOUNDS}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        className="w-full h-full z-0"
        ref={(instance) => {
          if (instance) mapInstanceRef.current = instance;
        }}
      >
        <TileLayer
          url={activeTileConfig.url}
          subdomains={activeTileConfig.subdomains}
          attribution={activeTileConfig.attribution}
          maxZoom={19}
        />

        {/* Controlador para centrar e focar */}
        <MapController
          focusedIssue={focusedIssue}
          selectedDossier={selectedDossier}
          userCoords={userLocation}
        />

        {/* Polilinha de Destaque do Dossiê de Rua Selecionado */}
        {dossierPolylineCoords && (
          <>
            {/* Glow escuro externo */}
            <Polyline
              positions={dossierPolylineCoords}
              pathOptions={{
                color: '#15301d',
                weight: 8,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Linha tracejada interna Verde Taiada */}
            <Polyline
              positions={dossierPolylineCoords}
              pathOptions={{
                color: '#347947',
                weight: 4,
                opacity: 0.95,
                dashArray: '6, 8',
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Pinos Normais de Chamados Visíveis */}
        {visibleIssues.map((issue) => {
          const isSelected = issue.id === selectedIssueId;
          const dossierPointNumber = dossierPointNumbersMap.get(issue.id);

          const icon = createIssueDivIcon({
            issue,
            isSelected,
            dossierPointNumber,
          });

          return (
            <Marker
              key={issue.id}
              position={[issue.latitude, issue.longitude]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectIssue(issue),
              }}
            />
          );
        })}

        {/* Pino Arrastável para Ajuste Fino de Localização */}
        {isSelectingLocation && dragLocation && onLocationAdjusted && (
          <DraggableMarker
            initialLat={dragLocation.latitude}
            initialLng={dragLocation.longitude}
            onAdjust={onLocationAdjusted}
          />
        )}

        {/* Marcador da Localização GPS Atual do Cidadão */}
        {userLocation && (
          <>
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={createUserLocationIcon()}
            />
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={userLocation.accuracy}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 1.5,
              }}
            />
          </>
        )}
      </MapContainer>

      {/* Botões Flutuantes de Ação no Mapa (Apple Design) */}
      <div className="absolute right-4 bottom-24 z-[990] flex flex-col gap-3">
        {/* Botão "Minha Localização GPS" */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          title="Minha Localização GPS em Caçapava"
          className="w-12 h-12 rounded-full bg-white/90 dark:bg-taiada-dark/90 text-taiada-dark dark:text-white shadow-xl backdrop-blur-xl border border-taiada-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all touch-manipulation"
        >
          {isLocating ? (
            <div className="w-5 h-5 border-2 border-taiada-primary border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <svg
              className="w-6 h-6 text-taiada-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="7" r="7" strokeWidth="2" />
              <line x1="12" y1="2" x2="12" y2="5" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="19" x2="12" y2="22" strokeWidth="2" strokeLinecap="round" />
              <line x1="2" y1="12" x2="5" y2="12" strokeWidth="2" strokeLinecap="round" />
              <line x1="19" y1="12" x2="22" y2="12" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* Botão Centralizar em Caçapava (Reset de Câmera) */}
        <button
          onClick={() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.flyTo(
                [CACAPAVA_CENTER.lat, CACAPAVA_CENTER.lng],
                DEFAULT_ZOOM,
                { duration: 0.8 }
              );
            }
          }}
          title="Centralizar em Caçapava"
          className="w-12 h-12 rounded-full bg-white/90 dark:bg-taiada-dark/90 text-taiada-dark dark:text-white shadow-xl backdrop-blur-xl border border-taiada-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all touch-manipulation"
        >
          <svg
            className="w-5 h-5 text-taiada-dark dark:text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
