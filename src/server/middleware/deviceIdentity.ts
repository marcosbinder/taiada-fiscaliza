/**
 * src/server/middleware/deviceIdentity.ts
 *
 * Middleware de Identidade Zero-Auth para o Taiada Fiscaliza ("Cobra, Taiada!").
 * Emite e valida o cookie assinado 'taiada_device_token' (HMAC-SHA256 via DEVICE_SECRET),
 * com fallback para o cabeçalho 'X-Device-Token' (sincronizado com localStorage).
 * Extrai a sub-rede IP do cliente (/24 para IPv4, /48 para IPv6) e calcula o 'device_hash'
 * anônimo de 32 caracteres (SHA-256), verificando status de shadowban em 'blocked_devices'.
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';
import { env } from '../../config/env';
import { getDb } from '../db';

// Extensão de tipos do Express para injetar req.device em todas as rotas
declare global {
  namespace Express {
    interface Request {
      device: {
        device_id: string;
        device_hash: string;
        token: string;
        ip_subnet: string;
        is_shadowbanned: boolean;
        is_new: boolean;
      };
    }
  }
}

/**
 * Valida a integridade e autenticidade do token via HMAC-SHA256 e timingSafeEqual.
 */
export function verifyToken(
  token: string,
  secret: string
): { valid: boolean; deviceId: string | null } {
  if (!token || typeof token !== 'string') {
    return { valid: false, deviceId: null };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, deviceId: null };
  }

  const [deviceId, signature] = parts;

  // Validação de formato de UUIDv4
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(deviceId)) {
    return { valid: false, deviceId: null };
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(deviceId)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length) {
    return { valid: false, deviceId: null };
  }

  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, deviceId: null };
  }

  return { valid: true, deviceId };
}

/**
 * Emite um novo par UUIDv4 + Assinatura HMAC-SHA256.
 */
export function generateDeviceToken(secret: string): { token: string; deviceId: string } {
  const deviceId = crypto.randomUUID();
  const signature = crypto.createHmac('sha256', secret).update(deviceId).digest('hex');
  return {
    deviceId,
    token: `${deviceId}.${signature}`,
  };
}

/**
 * Extrai o IP do cliente e mascara para sub-rede anônima (/24 para IPv4 e /48 para IPv6).
 */
export function extractIpSubnet(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  let clientIp = '';

  if (typeof forwarded === 'string') {
    clientIp = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    clientIp = forwarded[0].trim();
  } else {
    clientIp = req.socket?.remoteAddress || '127.0.0.1';
  }

  // Remove prefixo IPv4-mapped em IPv6 (::ffff:192.168.1.1)
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.slice(7);
  }

  // Loopback
  if (clientIp === '::1' || clientIp === '127.0.0.1') {
    return '127.0.0.0/24';
  }

  // IPv4: mascara último octeto (/24)
  if (clientIp.includes('.')) {
    const segments = clientIp.split('.');
    if (segments.length === 4) {
      return `${segments[0]}.${segments[1]}.${segments[2]}.0/24`;
    }
  }

  // IPv6: mascara para prefixo /48
  if (clientIp.includes(':')) {
    const segments = clientIp.split(':');
    return segments.slice(0, 3).join(':') + '::/48';
  }

  return '127.0.0.0/24';
}

/**
 * Calcula o device_hash anônimo de 32 caracteres (SHA-256).
 */
export function computeDeviceHash(deviceId: string, ipSubnet: string, secret: string): string {
  return crypto
    .createHash('sha256')
    .update(`${deviceId}:${ipSubnet}:${secret}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Verifica se o device_hash está marcado em blocked_devices (shadowban).
 */
export function isDeviceShadowbanned(deviceHash: string): boolean {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT shadowban FROM blocked_devices WHERE device_hash = ?')
      .get(deviceHash) as { shadowban: number } | undefined;
    return !!row && row.shadowban === 1;
  } catch {
    return false;
  }
}

/**
 * Middleware de Identidade Zero-Auth para Express.
 */
export function deviceIdentityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = env.DEVICE_SECRET;

  // 1. Tenta obter o cookie assinado 'taiada_device_token'
  let rawToken: string | undefined = req.cookies?.taiada_device_token;

  // 2. Fallback no header 'X-Device-Token'
  if (!rawToken && req.headers['x-device-token']) {
    const headerVal = req.headers['x-device-token'];
    rawToken = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  }

  let deviceId: string;
  let token: string;
  let isNew = false;

  const verification = rawToken ? verifyToken(rawToken, secret) : { valid: false, deviceId: null };

  if (verification.valid && verification.deviceId) {
    deviceId = verification.deviceId;
    token = rawToken!;
  } else {
    // Gera novo token válido caso inexistente ou adulterado
    const generated = generateDeviceToken(secret);
    deviceId = generated.deviceId;
    token = generated.token;
    isNew = true;

    // Emite cookie HttpOnly com SameSite Lax e 365 dias de validade
    res.cookie('taiada_device_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  // Sincroniza sempre o cabeçalho X-Device-Token na resposta para suporte PWA/localStorage
  res.setHeader('X-Device-Token', token);

  // 3. Extrai subnet IP e calcula device_hash
  const ipSubnet = extractIpSubnet(req);
  const deviceHash = computeDeviceHash(deviceId, ipSubnet, secret);

  // 4. Verifica status de Shadowban em blocked_devices
  const isShadowbanned = isDeviceShadowbanned(deviceHash);

  // 5. Injeta no objeto Request
  req.device = {
    device_id: deviceId,
    device_hash: deviceHash,
    token,
    ip_subnet: ipSubnet,
    is_shadowbanned: isShadowbanned,
    is_new: isNew,
  };

  next();
}

export default deviceIdentityMiddleware;
