// ============================================================================
// Yunta-Agro — Configuración de la conexión Web3 a Lnet (Hyperledger Besu)
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// SOLO LEE Y VALIDA variables de entorno. NO importa `ethers` ni abre ninguna
// conexión de red — es seguro importarlo desde el MVP fiat actual.
//
// Mientras LNET_ENABLED !== 'true' (default), `lnetConfig.enabled` es false y
// nada del runtime debe intentar conectar a la blockchain. La activación real
// (provider, listener, contratos) es Fase 3 — ver ../../contracts/README.md.
//
// Plantilla de variables: ../.env.web3.example
// ============================================================================

/** Forma tipada de la configuración Lnet leída del entorno. */
export interface LnetConfig {
  /** Interruptor maestro. Si es false, Yunta corre 100% fiat sin tocar Lnet. */
  enabled: boolean;
  /** RPC del writer node de Lnet/Besu. */
  rpcUrl: string;
  /** RPC de la Layer-2 EVM donde vive el seguro paramétrico. */
  l2RpcUrl: string;
  /** Chain ID de la red permisionada (NaN si no está configurado). */
  chainId: number;
  /** Contrato Relay Hub (modelo de gas no-monetario de Lnet). */
  relayHubAddress: string;
  /** Clave privada del writer node autorizado. SECRETO. */
  writerNodePrivateKey: string;
  /** Dirección desplegada del contrato ParametricInsurance.sol en la L2. */
  parametricInsuranceAddress: string;
  /** Oráculo climático (SENAMHI vía Chainlink / consorcio Lnet). */
  oracleAddress: string;
  senamhiApiUrl: string;
  senamhiApiKey: string;
  /** Identidad descentralizada (LACChain ID — DIDs/VCs W3C). */
  lacchainDidRegistry: string;
  lacchainIssuerDid: string;
}

const PLACEHOLDER_RE = /^(__PENDIENTE|0x0+$)/i;

/** ¿El valor sigue siendo un placeholder de la plantilla (no configurado)? */
function isPlaceholder(v: string | undefined): boolean {
  return !v || PLACEHOLDER_RE.test(v);
}

/** Lee la configuración Lnet del entorno (sin validar ni conectar). */
export const lnetConfig: LnetConfig = {
  enabled: (process.env.LNET_ENABLED ?? 'false').toLowerCase() === 'true',
  rpcUrl: process.env.LNET_RPC_URL ?? '',
  l2RpcUrl: process.env.LNET_L2_RPC_URL ?? '',
  chainId: Number(process.env.LNET_CHAIN_ID ?? NaN),
  relayHubAddress: process.env.RELAY_HUB_ADDRESS ?? '',
  writerNodePrivateKey: process.env.WRITER_NODE_PRIVATE_KEY ?? '',
  parametricInsuranceAddress: process.env.PARAMETRIC_INSURANCE_ADDRESS ?? '',
  oracleAddress: process.env.ORACLE_ADDRESS ?? '',
  senamhiApiUrl: process.env.SENAMHI_API_URL ?? '',
  senamhiApiKey: process.env.SENAMHI_API_KEY ?? '',
  lacchainDidRegistry: process.env.LACCHAIN_DID_REGISTRY ?? '',
  lacchainIssuerDid: process.env.LACCHAIN_ISSUER_DID ?? '',
};

/**
 * Devuelve la lista de campos obligatorios que siguen sin configurar (vacíos o
 * placeholders). Vacía => la config Lnet está completa para conectar.
 */
export function missingLnetConfig(c: LnetConfig = lnetConfig): string[] {
  const required: [keyof LnetConfig, string][] = [
    ['rpcUrl', 'LNET_RPC_URL'],
    ['l2RpcUrl', 'LNET_L2_RPC_URL'],
    ['chainId', 'LNET_CHAIN_ID'],
    ['relayHubAddress', 'RELAY_HUB_ADDRESS'],
    ['writerNodePrivateKey', 'WRITER_NODE_PRIVATE_KEY'],
    ['parametricInsuranceAddress', 'PARAMETRIC_INSURANCE_ADDRESS'],
  ];
  const missing: string[] = [];
  for (const [key, envName] of required) {
    const val = c[key];
    if (key === 'chainId') {
      if (Number.isNaN(val as number)) missing.push(envName);
    } else if (isPlaceholder(val as string)) {
      missing.push(envName);
    }
  }
  return missing;
}

/**
 * Guard para la Fase 3: lanza si LNET_ENABLED=true pero la config está
 * incompleta, para fallar temprano y claro en el bootstrap en vez de reventar
 * al primer uso del provider. NO conecta a la red — solo valida presencia.
 */
export function requireLnetConfig(): LnetConfig {
  if (!lnetConfig.enabled) {
    throw new Error(
      'Lnet/Web3 está deshabilitado (LNET_ENABLED=false). El MVP corre en modo fiat. ' +
      'Para activar, completa backend/.env con las variables de .env.web3.example.'
    );
  }
  const missing = missingLnetConfig();
  if (missing.length > 0) {
    throw new Error(
      `Config Lnet incompleta. Faltan variables: ${missing.join(', ')}. ` +
      'Ver backend/.env.web3.example y contracts/README.md.'
    );
  }
  return lnetConfig;
}
