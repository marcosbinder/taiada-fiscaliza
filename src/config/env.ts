/**
 * src/config/env.ts
 *
 * Validação Rigorosa de Variáveis de Ambiente via Zod.
 * Política Zero Segredos no Código:
 * - Em desenvolvimento/teste: valores padrão seguros para execução local out-of-the-box.
 * - Em produção: travas estritas contra segredos fracos, ausentes ou default de desenvolvimento.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Carrega arquivo .env se estiver em ambiente Node.js
if (typeof process !== 'undefined' && process.env) {
  dotenv.config();
}

export const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_PATH: z.string().min(1).default('./data/taiada-fiscaliza.db'),
    UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
    DEVICE_SECRET: z
      .string()
      .min(1)
      .default('dev-secret-device-hmac-cacapava-2026-min32chars'),
    ADMIN_TOKEN: z
      .string()
      .min(1)
      .default('cacapava-admin-secret-token-change-in-prod'),
    VITE_APP_BRAND_MODE: z.enum(['institucional', 'imperativo']).default('institucional'),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
    WEBHOOK_URL: z
      .string()
      .url()
      .optional()
      .or(z.literal(''))
      .transform((val) => (val === '' ? undefined : val)),
  })
  .superRefine((data, ctx) => {
    // Em produção, impõe auditoria de segurança rigorosa
    if (data.NODE_ENV === 'production') {
      if (data.DEVICE_SECRET === 'dev-secret-device-hmac-cacapava-2026-min32chars') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DEVICE_SECRET não pode usar o segredo padrão de desenvolvimento em ambiente de produção.',
          path: ['DEVICE_SECRET'],
        });
      }
      if (data.DEVICE_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DEVICE_SECRET deve possuir no mínimo 32 caracteres para garantir entropia em produção.',
          path: ['DEVICE_SECRET'],
        });
      }
      if (data.ADMIN_TOKEN === 'cacapava-admin-secret-token-change-in-prod') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ADMIN_TOKEN não pode usar o token padrão de desenvolvimento em ambiente de produção.',
          path: ['ADMIN_TOKEN'],
        });
      }
      if (data.ADMIN_TOKEN.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ADMIN_TOKEN deve possuir no mínimo 16 caracteres em ambiente de produção.',
          path: ['ADMIN_TOKEN'],
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Valida um dicionário de ambiente arbitrário (útil para testes unitários e de integração).
 */
export function validateEnv(
  rawEnv: Record<string, unknown> = (typeof process !== 'undefined' ? process.env : {}) as Record<
    string,
    unknown
  >
): EnvConfig {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues
      .map((issue) => `[${issue.path.join('.') || 'root'}]: ${issue.message}`)
      .join('\n');
    throw new Error(`Falha crítica na validação das variáveis de ambiente:\n${errorMessages}`);
  }
  return parsed.data;
}

/**
 * Instância singleton das configurações validadas do servidor.
 */
export const env: EnvConfig = (function getValidatedEnv(): EnvConfig {
  try {
    const raw = typeof process !== 'undefined' && process.env ? process.env : {};
    return validateEnv(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('⚠️ [ERRO DE CONFIGURAÇÃO DE AMBIENTE]:', message);
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    // Em desenvolvimento, se houver falha inesperada, retorna defaults
    return envSchema.parse({});
  }
})();
