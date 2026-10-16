/**
 * src/server/services/imagePipeline.ts
 *
 * Pipeline Seguro de Processamento de Imagens, Extração Seletiva EXIF e Sanitização.
 * Responsabilidades:
 * 1. Multer em memória (MemoryStorage, limite 15MB, filtro de magic types).
 * 2. Validação condicional de foto obrigatória (5 categorias) vs opcional (3 categorias).
 * 3. Extração seletiva EXIF (DateTimeOriginal, Lat, Lng) com tolerância total a imagens sem EXIF.
 * 4. Verificação de foto no local (<= 250m dentro de Caçapava -> exif_verified_local = 1).
 * 5. Heurística anti-troll via sharp.stats() (fotos pretas, brancas, lisas/borradas e proporções de meme).
 * 6. Sanitização total via sharp convertendo para .webp (qualidade 80, máx 1280x1280, 100% livre de dados pessoais/hardware).
 */

import multer from 'multer';
import sharp from 'sharp';
import exifr from 'exifr';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  isWithinCacapava,
  haversineDistanceMeters,
  EXIF_LOCAL_VERIFIED_RADIUS_METERS,
} from '../../shared/geo';
import { IssueCategory } from '../../shared/types';
import { isPhotoRequired, CATEGORY_MAP } from '../../shared/categories';

export class ImagePipelineError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = 'IMAGE_PIPELINE_ERROR', statusCode = 400) {
    super(message);
    this.name = 'ImagePipelineError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Configuração Multer em memória com limite de 15MB e validação de tipos de imagem permitidos.
 */
export const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 Megabytes
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
    ];

    if (allowedMimes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(
        new ImagePipelineError(
          'Formato de arquivo não suportado. Por favor, envie uma foto em formato JPEG, PNG, WebP ou HEIC.',
          'UNSUPPORTED_IMAGE_FORMAT',
          400
        )
      );
    }
  },
});

/**
 * Valida a obrigatoriedade de foto conforme as regras das 8 categorias oficiais de Caçapava.
 */
export function validateCategoryPhotoRequirement(category: IssueCategory, hasFile: boolean): void {
  const required = isPhotoRequired(category);
  if (required && !hasFile) {
    const catDef = CATEGORY_MAP[category];
    const catLabel = catDef ? catDef.label : category;
    throw new ImagePipelineError(
      `A categoria "${catLabel}" exige o anexo de foto comprovatória para orientar a fiscalização urbana.`,
      'PHOTO_REQUIRED',
      400
    );
  }
}

export interface ExifExtractionResult {
  hasExif: boolean;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  isVerifiedLocal: number; // 0 ou 1
}

/**
 * Extrai dados seletivos de auditoria EXIF (data original e coordenadas GPS) do buffer em memória.
 * Tolerância Total: Se a foto não possuir EXIF, retorna campos nulos e isVerifiedLocal = 0 sem erro.
 */
export async function extractExifMetadata(
  buffer: Buffer,
  targetLat?: number,
  targetLng?: number
): Promise<ExifExtractionResult> {
  const result: ExifExtractionResult = {
    hasExif: false,
    capturedAt: null,
    latitude: null,
    longitude: null,
    distanceMeters: null,
    isVerifiedLocal: 0,
  };

  try {
    const parsed = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'],
    });

    if (!parsed) {
      return result;
    }

    result.hasExif = true;

    // 1. Data e Hora original
    const rawDate = parsed.DateTimeOriginal || parsed.CreateDate;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        result.capturedAt = d.toISOString();
      }
    }

    // 2. Coordenadas GPS da foto
    const lat = typeof parsed.latitude === 'number' && !isNaN(parsed.latitude) ? parsed.latitude : null;
    const lng = typeof parsed.longitude === 'number' && !isNaN(parsed.longitude) ? parsed.longitude : null;

    if (lat !== null && lng !== null) {
      result.latitude = lat;
      result.longitude = lng;

      // Se temos as coordenadas do relato informado pelo usuário, calcula a proximidade
      if (typeof targetLat === 'number' && typeof targetLng === 'number') {
        const dist = haversineDistanceMeters(lat, lng, targetLat, targetLng);
        result.distanceMeters = dist;

        // Foto verificada no local se estiver a <= 250m do pino e dentro de Caçapava
        if (dist <= EXIF_LOCAL_VERIFIED_RADIUS_METERS && isWithinCacapava(lat, lng)) {
          result.isVerifiedLocal = 1;
        }
      }
    }
  } catch {
    // Falha silenciosa na leitura do EXIF: segue sem bloquear o munícipe
    result.hasExif = false;
  }

  return result;
}

export interface ImageQualityReport {
  isSuspicious: boolean;
  reason?: string;
  entropy: number;
  meanLuminance: number;
  meanStdev: number;
  aspectRatio: number;
}

/**
 * Executa heurística anti-troll baseada nas estatísticas do Sharp:
 * - Foto escura (dedo na lente / bolso): luminância média < 12 e stdev < 10
 * - Foto branca total / estourada: luminância média > 248 e stdev < 8
 * - Foto lisa / borrada extrema / sem textura: entropia < 3.2 ou stdev < 11
 * - Proporção de aspecto anômala de captura de tela / meme: ratio > 2.5 ou < 0.4 com baixa entropia
 */
export async function analyzeImageQuality(buffer: Buffer): Promise<ImageQualityReport> {
  const sharpInstance = sharp(buffer);
  const stats = await sharpInstance.stats();
  const meta = await sharpInstance.metadata();

  const rgb = stats.channels.slice(0, 3);
  const meanLuminance = rgb.reduce((acc, c) => acc + c.mean, 0) / rgb.length;
  const meanStdev = rgb.reduce((acc, c) => acc + c.stdev, 0) / rgb.length;
  const entropy = stats.entropy;

  const width = meta.width || 1;
  const height = meta.height || 1;
  const aspectRatio = Math.round((width / height) * 100) / 100;

  let isSuspicious = false;
  let reason: string | undefined;

  if (meanLuminance < 12 && meanStdev < 10) {
    isSuspicious = true;
    reason = 'Foto excessivamente escura (possível lente obstruída ou foto no bolso)';
  } else if (meanLuminance > 248 && meanStdev < 8) {
    isSuspicious = true;
    reason = 'Foto excessivamente clara ou tela em branco total';
  } else if (entropy < 3.2 || meanStdev < 11) {
    isSuspicious = true;
    reason = 'Baixa entropia visual ou superfície lisa sem detalhes do problema';
  } else if ((aspectRatio > 2.5 || aspectRatio < 0.4) && entropy < 4.0) {
    isSuspicious = true;
    reason = 'Proporção dimensional atípica combinada com baixa densidade de informação';
  }

  return {
    isSuspicious,
    reason,
    entropy: Math.round(entropy * 100) / 100,
    meanLuminance: Math.round(meanLuminance * 10) / 10,
    meanStdev: Math.round(meanStdev * 10) / 10,
    aspectRatio,
  };
}

export interface SanitizedImageOutput {
  photoUrl: string;
  absolutePath: string;
  width: number;
  height: number;
  sizeBytes: number;
  qualityReport: ImageQualityReport;
}

/**
 * Valida os magic bytes reais, redimensiona para no máx 1280x1280, rotaciona e salva em .webp (q=80).
 * NUNCA chama .withMetadata(): remove 100% de EXIF, serial, modelo de câmera e dados pessoais do arquivo público.
 */
export async function sanitizeAndSaveImage(
  buffer: Buffer,
  uploadsDir: string,
  filenamePrefix = 'issue'
): Promise<SanitizedImageOutput> {
  // 1. Validação de Magic Bytes reais via Sharp
  const probe = sharp(buffer);
  let meta: sharp.Metadata;
  try {
    meta = await probe.metadata();
  } catch {
    throw new ImagePipelineError(
      'O arquivo enviado está corrompido ou não é uma imagem válida.',
      'INVALID_IMAGE',
      400
    );
  }

  if (!meta.format) {
    throw new ImagePipelineError(
      'Não foi possível identificar o formato da imagem enviada.',
      'INVALID_IMAGE',
      400
    );
  }

  // 2. Análise de Qualidade Anti-Brincadeira
  const qualityReport = await analyzeImageQuality(buffer);

  // 3. Processamento de Redimensionamento e Sanitização Total
  const transformed = sharp(buffer)
    .rotate() // auto-orientação baseada na rotação EXIF antes de descartar metadados
    .resize({
      width: 1280,
      height: 1280,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 });

  const webpBuffer = await transformed.toBuffer();
  const outMeta = await sharp(webpBuffer).metadata();

  // 4. Criação do diretório de destino e gravação com nome seguro e não previsível
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const randomHash = crypto.randomBytes(8).toString('hex');
  const filename = `${filenamePrefix}_${Date.now()}_${randomHash}.webp`;
  const absolutePath = path.resolve(uploadsDir, filename);

  fs.writeFileSync(absolutePath, webpBuffer);

  return {
    photoUrl: `/uploads/${filename}`,
    absolutePath,
    width: outMeta.width || 0,
    height: outMeta.height || 0,
    sizeBytes: webpBuffer.length,
    qualityReport,
  };
}
