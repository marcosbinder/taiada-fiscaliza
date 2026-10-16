/**
 * src/utils/qrCode.tsx
 *
 * Gerador de QR Code Vetorial SVG Puro em TypeScript para o Taiada Fiscaliza ("Cobra, Taiada!").
 * Executa inteiramente no navegador sem nenhuma requisição HTTP externa ou dependência de terceiros.
 * Suporta codificação Byte (ISO-8859-1 / UTF-8) e correção de erro Reed-Solomon sobre GF(256).
 */

import React from 'react';

// Galois Field GF(256) com polinômio primitivo 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], GF_EXP[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCalculateEcc(data: Uint8Array, eccLength: number): Uint8Array {
  const gen = rsGeneratorPoly(eccLength);
  const ecc = new Uint8Array(eccLength);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ ecc[0];
    for (let j = 0; j < eccLength - 1; j++) {
      ecc[j] = ecc[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    ecc[eccLength - 1] = gfMul(gen[eccLength], factor);
  }
  return ecc;
}

// Configuração para QR Code com Nível de Correção M
interface QrConfig {
  version: number;
  size: number;
  totalCodewords: number;
  dataCodewords: number;
  eccCodewords: number;
  alignmentPatternPos: number[];
}

const QR_CONFIGS: QrConfig[] = [
  // Versão 2: 25x25 (até 32 bytes de dados no nível M)
  { version: 2, size: 25, totalCodewords: 44, dataCodewords: 28, eccCodewords: 16, alignmentPatternPos: [6, 18] },
  // Versão 3: 29x29 (até 53 bytes de dados no nível M)
  { version: 3, size: 29, totalCodewords: 70, dataCodewords: 44, eccCodewords: 26, alignmentPatternPos: [6, 22] },
  // Versão 4: 33x33 (até 78 bytes de dados no nível M)
  { version: 4, size: 33, totalCodewords: 100, dataCodewords: 64, eccCodewords: 36, alignmentPatternPos: [6, 26] },
  // Versão 5: 37x37 (até 106 bytes de dados no nível M)
  { version: 5, size: 37, totalCodewords: 134, dataCodewords: 86, eccCodewords: 48, alignmentPatternPos: [6, 30] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);

  // Seleciona a versão de menor capacidade que acomoda os bytes (Modo Byte: 4 bits modo + 8 bits contagem)
  const requiredDataBytes = textBytes.length + 2; // Cabeçalho + dados
  let cfg = QR_CONFIGS[0];
  for (const c of QR_CONFIGS) {
    if (c.dataCodewords >= requiredDataBytes) {
      cfg = c;
      break;
    }
    cfg = c;
  }

  // 1. Criação do buffer de bits de dados
  const bitArray: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitArray.push((val >>> i) & 1);
    }
  };

  // Modo Byte (0100)
  pushBits(0b0100, 4);
  // Contador de caracteres (8 bits para versão 1-9)
  pushBits(textBytes.length, 8);
  // Dados brutos
  for (let i = 0; i < textBytes.length; i++) {
    pushBits(textBytes[i], 8);
  }
  // Terminador (até 4 zeros)
  const remainingBits = cfg.dataCodewords * 8 - bitArray.length;
  pushBits(0, Math.min(4, Math.max(0, remainingBits)));
  // Alinhamento em múltiplos de 8 bits
  while (bitArray.length % 8 !== 0) {
    bitArray.push(0);
  }
  // Preenchimento alternado (Pad Bytes: 0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitArray.length < cfg.dataCodewords * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Conversão de bits para array de bytes
  const dataCodewords = new Uint8Array(cfg.dataCodewords);
  for (let i = 0; i < cfg.dataCodewords; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitArray[i * 8 + b];
    }
    dataCodewords[i] = byteVal;
  }

  // Cálculo de Reed-Solomon ECC
  const eccCodewords = rsCalculateEcc(dataCodewords, cfg.eccCodewords);

  // Concatenação de dados + ECC
  const finalCodewords = new Uint8Array(cfg.totalCodewords);
  finalCodewords.set(dataCodewords, 0);
  finalCodewords.set(eccCodewords, dataCodewords.length);

  // Inicialização da Matriz
  const size = cfg.size;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  };

  // 2. Padrões de Localização (Finder Patterns 7x7) nos 3 cantos
  const placeFinder = (startR: number, startC: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(startR + r, startC + c, isBorder || isCenter);
      }
    }
    // Separador em branco
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = startR + r;
        const cc = startC + c;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
          if (!isFunction[rr][cc]) {
            setModule(rr, cc, false);
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 3. Padrões de Sincronização (Timing Patterns)
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (!isFunction[6][i]) setModule(6, i, val);
    if (!isFunction[i][6]) setModule(i, 6, val);
  }

  // 4. Padrões de Alinhamento (Alignment Patterns 5x5)
  if (cfg.alignmentPatternPos.length >= 2) {
    const pos = cfg.alignmentPatternPos;
    for (const r of pos) {
      for (const c of pos) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // 5. Ponto escuro fixo (Dark Module)
  setModule(4 * cfg.version + 9, 8, true);

  // 6. Reserva da Informação de Formato
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }

  // 7. Colocação dos Bits de Dados (em zigue-zague de 2 colunas da direita para a esquerda)
  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  let dirUp = true;

  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Pula a coluna de sincronismo 6

    const rows = dirUp
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [rightCol, rightCol - 1]) {
        if (!isFunction[r][c]) {
          let bit = false;
          if (bitIdx < totalBits) {
            const byteIndex = Math.floor(bitIdx / 8);
            const bitOffset = 7 - (bitIdx % 8);
            bit = ((finalCodewords[byteIndex] >>> bitOffset) & 1) === 1;
            bitIdx++;
          }
          // Máscara Padrão 0: (r + c) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? !bit : bit;
        }
      }
    }
    dirUp = !dirUp;
  }

  // 8. Informação de Formato (Nível M + Máscara 0: valor format = 0b101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Aplica horizontal e vertical
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  return matrix;
}

export interface QrCodeSvgProps {
  value: string;
  size?: number;
  color?: string;
  bgColor?: string;
  className?: string;
}

/**
 * Componente React que renderiza o QR Code como SVG vetorial inline.
 * 100% autônomo, responsivo e perfeito para impressão A4.
 */
export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({
  value,
  size = 140,
  color = '#15301d',
  bgColor = '#ffffff',
  className = '',
}) => {
  const matrix = React.useMemo(() => generateQrMatrix(value), [value]);
  const matrixSize = matrix.length;

  // Monta um único caminho SVG (path d="...") para otimização máxima de nós DOM
  const pathData = React.useMemo(() => {
    let d = '';
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (matrix[r][c]) {
          d += `M${c},${r}h1v1h-1z `;
        }
      }
    }
    return d;
  }, [matrix, matrixSize]);

  return (
    <svg
      viewBox={`0 0 ${matrixSize} ${matrixSize}`}
      width={size}
      height={size}
      className={`shape-rendering-crispEdges ${className}`}
      style={{ shapeRendering: 'crispEdges' }}
      role="img"
      aria-label={`QR Code para ${value}`}
    >
      <rect width={matrixSize} height={matrixSize} fill={bgColor} />
      <path d={pathData} fill={color} />
    </svg>
  );
};
