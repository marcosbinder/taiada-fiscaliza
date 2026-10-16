/**
 * src/components/CreateIssueSheet.tsx
 *
 * Wizard de Criação de Demanda Cívica do Taiada Fiscaliza ("Cobra, Taiada!").
 *
 * 3 Etapas Rápidas com Stepper Visual:
 * - Etapa 1: Categoria (8 opções) e Nível de Gravidade (1..5).
 * - Etapa 2: Localização em Caçapava (4 modos com Geofence síncrono e detecção de duplicata <= 40m).
 * - Etapa 3: Upload de foto com preview (condicional por categoria), dados textuais e autor opcional.
 */

import React, { useState, useRef } from 'react';
import exifr from 'exifr';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Loader2,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { FluidBottomSheet } from './FluidBottomSheet';
import {
  IssueCategory,
  IssueSeverity,
  LocationSource,
  CheckDuplicatesResponse,
  DuplicateCandidate,
  Issue,
} from '../shared/types';
import {
  CATEGORIES_LIST,
  SEVERITY_LEVELS_LIST,
  getCategoryDefinition,
  isPhotoRequired,
} from '../shared/categories';
import {
  isWithinCacapava,
  CACAPAVA_CENTER,
  CACAPAVA_MAJOR_STREETS,
  CACAPAVA_NEIGHBORHOODS,
} from '../shared/geo';

export interface CreateIssueSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdIssue: Issue) => void;
  onSelectDuplicateToContribute: (candidate: DuplicateCandidate) => void;
  initialCoords?: { lat: number; lng: number };
}

export const CreateIssueSheet: React.FC<CreateIssueSheetProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSelectDuplicateToContribute,
  initialCoords,
}) => {
  // Controle de etapas do Wizard (1, 2, 3)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Etapa 1: Categoria e Gravidade
  const [category, setCategory] = useState<IssueCategory>('buracos_vias');
  const [severity, setSeverity] = useState<IssueSeverity>(3);

  // Etapa 2: Localização
  const [locationSource, setLocationSource] = useState<LocationSource>('gps_live');
  const [latitude, setLatitude] = useState<number>(initialCoords?.lat || CACAPAVA_CENTER.lat);
  const [longitude, setLongitude] = useState<number>(initialCoords?.lng || CACAPAVA_CENTER.lng);
  const [rawLatitude, setRawLatitude] = useState<number | undefined>(initialCoords?.lat);
  const [rawLongitude, setRawLongitude] = useState<number | undefined>(initialCoords?.lng);
  const [streetName, setStreetName] = useState<string>('Avenida Brasil');
  const [neighborhood, setNeighborhood] = useState<string>('Vera Cruz');
  const [referencePoint, setReferencePoint] = useState<string>('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | undefined>(undefined);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Deduplicação síncrona
  const [duplicateResult, setDuplicateResult] = useState<CheckDuplicatesResponse | null>(null);

  // Etapa 3: Foto, Campos Auxiliares e Identificação
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [exifDate, setExifDate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [auxiliaryData, setAuxiliaryData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset do formulário
  const resetForm = () => {
    setStep(1);
    setCategory('buracos_vias');
    setSeverity(3);
    setPhotoFile(null);
    setPhotoPreview(null);
    setExifDate(null);
    setTitle('');
    setDescription('');
    setAuthorName('');
    setAuxiliaryData({});
    setDuplicateResult(null);
    setSubmitError(null);
    setGeoError(null);
  };

  // 1. Obtenção de GPS ao Vivo
  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalização não suportada pelo seu navegador.');
      return;
    }

    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGpsAccuracy(Math.round(pos.coords.accuracy));

        if (!isWithinCacapava(lat, lng)) {
          setGeoError(
            'Seu GPS indica uma localização fora de Caçapava - SP. O Taiada Fiscaliza atende exclusivamente o município.'
          );
          return;
        }

        setLatitude(lat);
        setLongitude(lng);
        setRawLatitude(lat);
        setRawLongitude(lng);
        setLocationSource('gps_live');
        checkDuplicates(lat, lng, category, streetName);
      },
      (err) => {
        setGeoError(`Não foi possível obter o GPS: ${err.message}. Escolha busca por rua.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // 2. Extração de EXIF ao selecionar foto
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));

    try {
      // Leitura de EXIF via exifr no navegador
      const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude']);
      if (exif) {
        if (exif.DateTimeOriginal || exif.CreateDate) {
          const date = new Date(exif.DateTimeOriginal || exif.CreateDate);
          setExifDate(date.toLocaleString('pt-BR'));
        }

        if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
          if (isWithinCacapava(exif.latitude, exif.longitude)) {
            setLatitude(exif.latitude);
            setLongitude(exif.longitude);
            setLocationSource('photo_exif');
            checkDuplicates(exif.latitude, exif.longitude, category, streetName);
          }
        }
      }
    } catch {
      // Ignora erro se imagem não contiver metadados EXIF
    }
  };

  // 3. Verificação Síncrona de Duplicatas (<= 40m)
  const checkDuplicates = async (lat: number, lng: number, cat: IssueCategory, street: string) => {
    try {
      const res = await fetch('/api/issues/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          category: cat,
          street_name: street,
        }),
      });

      if (res.ok) {
        const data: CheckDuplicatesResponse = await res.json();
        setDuplicateResult(data);
      }
    } catch {
      // Não bloqueia o morador se houver falha de rede na checagem
    }
  };

  // 3.1. Fusão em 1 Clique (Opção A da Interseção <= 40m -> POST /api/issues/:id/contribute)
  const handleContributeToDuplicate = async (candidate: DuplicateCandidate) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      const noteText =
        description.trim() ||
        (referencePoint.trim()
          ? `Apoio registrado próximo a: ${referencePoint.trim()}`
          : 'Morador confirmou o problema neste mesmo ponto.');
      formData.append('note', noteText);
      if (authorName.trim()) {
        formData.append('author_name', authorName.trim());
      }
      if (photoFile) {
        formData.append('photo', photoFile);
      }

      await fetch(`/api/issues/${candidate.id}/contribute`, {
        method: 'POST',
        body: formData,
      });
    } catch {
      // Continua o fluxo otimista mesmo em oscilação momentânea de rede
    } finally {
      setIsSubmitting(false);
      resetForm();
      onSelectDuplicateToContribute(candidate);
    }
  };

  // 4. Submissão do Formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validação de foto obrigatória
    if (isPhotoRequired(category) && !photoFile) {
      setSubmitError('A foto é obrigatória para esta categoria.');
      return;
    }

    // Validação de campos mínimos
    if (!title.trim() || title.trim().length < 5) {
      setSubmitError('Informe um título claro com pelo menos 5 caracteres.');
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setSubmitError('Descreva o problema com pelo menos 10 caracteres.');
      return;
    }

    if (!isWithinCacapava(latitude, longitude)) {
      setSubmitError('Coordenadas fora dos limites municipais de Caçapava - SP.');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('category', category);
    formData.append('severity', String(severity));
    formData.append('latitude', String(latitude));
    formData.append('longitude', String(longitude));
    if (rawLatitude) formData.append('raw_latitude', String(rawLatitude));
    if (rawLongitude) formData.append('raw_longitude', String(rawLongitude));
    formData.append('street_name', streetName.trim());
    formData.append('neighborhood', neighborhood.trim());
    if (referencePoint.trim()) formData.append('reference_point', referencePoint.trim());
    formData.append('location_source', locationSource);
    if (gpsAccuracy) formData.append('gps_accuracy_meters', String(gpsAccuracy));
    if (authorName.trim()) formData.append('author_name', authorName.trim());
    if (Object.keys(auxiliaryData).length > 0) {
      formData.append('auxiliary_data', JSON.stringify(auxiliaryData));
    }
    if (photoFile) {
      formData.append('photo', photoFile);
    }

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Falha ao registrar problema.');
      }

      const created = await res.json();
      resetForm();
      onClose();
      onSuccess(created.issue || created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryDef = getCategoryDefinition(category);

  return (
    <FluidBottomSheet
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      initialSnap="expanded"
      title={
        <div className="flex items-center gap-2">
          <span className="text-taiada-primary font-bold">Cobra, Taiada!</span>
          <span className="text-gray-400">|</span>
          <span className="text-sm font-medium text-taiada-dark dark:text-gray-200">
            {step === 1 && 'Etapa 1 de 3: Categoria'}
            {step === 2 && 'Etapa 2 de 3: Localização'}
            {step === 3 && 'Etapa 3 de 3: Detalhes'}
          </span>
        </div>
      }
    >
      {/* Stepper Visual */}
      <div className="flex items-center justify-between mb-5 px-1">
        {[1, 2, 3].map((num) => (
          <div key={num} className="flex-1 flex items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === num
                  ? 'bg-taiada-primary text-white shadow-md shadow-taiada-primary/30'
                  : step > num
                  ? 'bg-taiada-dark text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}
            >
              {step > num ? '✓' : num}
            </div>
            {num < 3 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  step > num ? 'bg-taiada-primary' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* ========================================================== */}
      {/* ETAPA 1: Categoria e Gravidade                             */}
      {/* ========================================================== */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-taiada-dark dark:text-gray-200 mb-2">
              Selecione o tipo de problema em Caçapava:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {CATEGORIES_LIST.map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'border-taiada-primary bg-taiada-primary/10 shadow-sm ring-1 ring-taiada-primary'
                        : 'border-taiada-dark/10 dark:border-white/10 bg-white dark:bg-taiada-dark hover:border-taiada-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-taiada-dark dark:text-white">
                        {cat.shortLabel}
                      </span>
                      {cat.photoRequired ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-medium">
                          Foto obrig.
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                          Opcional
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {cat.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-taiada-dark dark:text-gray-200 mb-2">
              Nível de Gravidade:
            </label>
            <div className="space-y-2">
              {SEVERITY_LEVELS_LIST.map((sev) => {
                const isSelected = severity === sev.level;
                return (
                  <button
                    key={sev.level}
                    type="button"
                    onClick={() => setSeverity(sev.level)}
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition-all active:scale-[0.99] ${
                      isSelected
                        ? 'border-taiada-primary bg-taiada-primary/10 shadow-sm'
                        : 'border-taiada-dark/10 dark:border-white/10 bg-white dark:bg-taiada-dark'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sev.color }}
                      />
                      <div className="text-left">
                        <span className="font-semibold text-sm text-taiada-dark dark:text-white block">
                          {sev.label}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">
                          {sev.impactExample}
                        </span>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-taiada-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setStep(2);
              checkDuplicates(latitude, longitude, category, streetName);
            }}
            className="w-full py-3.5 bg-taiada-primary text-white font-bold rounded-2xl shadow-lg shadow-taiada-primary/25 hover:bg-taiada-dark transition-all active:scale-[0.97] flex items-center justify-center gap-2"
          >
            Prosseguir para Localização
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ========================================================== */}
      {/* ETAPA 2: Localização e Checagem de Duplicatas              */}
      {/* ========================================================== */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-taiada-dark dark:text-gray-200 mb-2">
              Como deseja indicar o local em Caçapava?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleGetGpsLocation}
                className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${
                  locationSource === 'gps_live'
                    ? 'border-taiada-primary bg-taiada-primary/10 font-bold text-taiada-dark dark:text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Crosshair className="w-4 h-4 text-taiada-primary" />
                <span className="text-xs">GPS ao Vivo</span>
              </button>
              <button
                type="button"
                onClick={() => setLocationSource('search_address')}
                className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${
                  locationSource === 'search_address'
                    ? 'border-taiada-primary bg-taiada-primary/10 font-bold text-taiada-dark dark:text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Search className="w-4 h-4 text-taiada-primary" />
                <span className="text-xs">Buscar Rua</span>
              </button>
            </div>
          </div>

          {geoError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{geoError}</span>
            </div>
          )}

          {/* Seletores de Rua e Bairro de Caçapava */}
          <div className="space-y-3 bg-gray-50 dark:bg-taiada-dark/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Logradouro / Avenida / Rua:
              </label>
              <input
                type="text"
                list="major-streets"
                value={streetName}
                onChange={(e) => {
                  setStreetName(e.target.value);
                  checkDuplicates(latitude, longitude, category, e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
                placeholder="Ex: Avenida Brasil"
              />
              <datalist id="major-streets">
                {CACAPAVA_MAJOR_STREETS.map((s) => (
                  <option key={s.street} value={s.street} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Bairro de Caçapava:
              </label>
              <select
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
              >
                {CACAPAVA_NEIGHBORHOODS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Ponto de Referência (opcional):
              </label>
              <input
                type="text"
                value={referencePoint}
                onChange={(e) => setReferencePoint(e.target.value)}
                placeholder="Ex: Em frente à padaria ou próximo ao poste 42"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
              />
            </div>
          </div>

          {/* CARD VERDE TAIADA DE INTERSEÇÃO (Deduplicação <= 40m) */}
          {duplicateResult?.has_nearby_duplicate && duplicateResult.duplicate_issue && (
            <div className="p-4 rounded-2xl bg-[#347947]/10 border-2 border-taiada-primary space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-taiada-primary text-white flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-taiada-dark dark:text-white">
                    Chamado já existente neste local!
                  </h4>
                  <p className="text-xs text-taiada-dark/80 dark:text-gray-300 mt-0.5">
                    Identificamos um relato de <strong>{selectedCategoryDef.shortLabel}</strong> a{' '}
                    <strong>{duplicateResult.duplicate_issue.distance_meters} metros</strong> daqui: &quot;
                    {duplicateResult.duplicate_issue.title}&quot; com{' '}
                    <strong>{duplicateResult.duplicate_issue.upvotes_count} apoios</strong>.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleContributeToDuplicate(duplicateResult.duplicate_issue!)}
                  className="w-full py-2.5 bg-taiada-primary text-white text-xs font-bold rounded-xl shadow-md hover:bg-taiada-dark transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {isSubmitting
                    ? 'Somando apoio ao chamado...'
                    : 'Opção A (Recomendado): Somar meu apoio a este chamado existente'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full py-2 bg-transparent text-gray-600 dark:text-gray-400 text-xs font-medium hover:underline text-center"
                >
                  Opção B: Não, é outro problema separado (Criar novo protocolo)
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="py-3 px-5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 py-3 bg-taiada-primary text-white font-bold rounded-2xl shadow-lg shadow-taiada-primary/25 hover:bg-taiada-dark transition-all flex items-center justify-center gap-2"
            >
              Prosseguir para Detalhes
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* ETAPA 3: Upload de Foto, Descrição e Autor                 */}
      {/* ========================================================== */}
      {step === 3 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Upload de Foto */}
          <div>
            <label className="block text-sm font-semibold text-taiada-dark dark:text-gray-200 mb-1">
              Foto da Ocorrência:
              {isPhotoRequired(category) ? (
                <span className="text-red-500 font-bold ml-1">* (Obrigatória)</span>
              ) : (
                <span className="text-gray-400 font-normal ml-1">(Opcional)</span>
              )}
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {selectedCategoryDef.photoHelpText}
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 h-44 bg-gray-100 dark:bg-gray-800">
                <img
                  src={photoPreview}
                  alt="Pré-visualização"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoPreview(null);
                    setExifDate(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black"
                >
                  <X className="w-4 h-4" />
                </button>
                {exifDate && (
                  <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/70 backdrop-blur-md text-white text-[10px] rounded-lg">
                    Data original: {exifDate}
                  </div>
                )}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-6 text-center cursor-pointer hover:border-taiada-primary transition-all active:scale-[0.99] bg-gray-50 dark:bg-taiada-dark/40"
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-taiada-primary/10 text-taiada-primary flex items-center justify-center mb-2">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-taiada-dark dark:text-white block">
                  Toque para tirar foto ou selecionar da galeria
                </span>
                <span className="text-xs text-gray-400 block mt-0.5">
                  JPG, PNG ou WebP até 15MB
                </span>
              </div>
            )}
          </div>

          {/* Campos Auxiliares Específicos por Categoria */}
          {selectedCategoryDef.auxiliaryFields.map((field) => (
            <div key={field.id}>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type={field.type}
                value={auxiliaryData[field.id] || ''}
                onChange={(e) =>
                  setAuxiliaryData((prev) => ({ ...prev, [field.id]: e.target.value }))
                }
                placeholder={field.placeholder}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
              />
              {field.helpText && (
                <p className="text-[11px] text-gray-400 mt-0.5">{field.helpText}</p>
              )}
            </div>
          ))}

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Título Curto do Problema: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Cratera perigosa no asfalto perto do cruzamento"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Descrição Detalhada: <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva a dimensão do problema, há quanto tempo existe e se já provocou acidentes ou danos..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
            />
          </div>

          {/* Autor Opcional */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Seu Nome ou Apelido Comunitário (Opcional):
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Ex: Cidadão da Vila Resende (sem telefone ou links)"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-taiada-dark text-base text-taiada-dark dark:text-white focus:outline-none focus:ring-2 focus:ring-taiada-primary"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">
              Não exige cadastro. Mantemos sua privacidade com Zero-Auth.
            </p>
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300">
              {submitError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="py-3 px-5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3.5 bg-taiada-primary text-white font-bold rounded-2xl shadow-lg shadow-taiada-primary/25 hover:bg-taiada-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Registrando Demanda...
                </>
              ) : (
                '+ Cobra, Taiada! Enviar Relato'
              )}
            </button>
          </div>
        </form>
      )}
    </FluidBottomSheet>
  );
};
