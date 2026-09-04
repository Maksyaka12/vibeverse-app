import { Attribution } from 'ox/erc8021';

export const BUILDER_CODE = 'bc_wsbqqe2u';

// Official Base ERC-8021 Data Suffix (e.g. 0x62635f77736271716532750b0080218021802180218021802180218021)
export const DATA_SUFFIX = BUILDER_CODE
  ? Attribution.toDataSuffix({ codes: [BUILDER_CODE] })
  : '';

// Hex string without 0x prefix
export const BUILDER_CODE_HEX = DATA_SUFFIX.startsWith('0x')
  ? DATA_SUFFIX.slice(2)
  : DATA_SUFFIX;

/**
 * Appends the official ERC-8021 Builder Code suffix to transaction calldata if not already present.
 * @param {string} calldata - Raw hex calldata (with or without 0x)
 * @returns {string} - Calldata with ERC-8021 data suffix attached
 */
export function appendBuilderSuffix(calldata) {
  if (!calldata) return '0x';
  const clean = calldata.startsWith('0x') ? calldata : `0x${calldata}`;
  if (!BUILDER_CODE_HEX) return clean;
  if (clean.toLowerCase().endsWith(BUILDER_CODE_HEX.toLowerCase())) {
    return clean;
  }
  return `${clean}${BUILDER_CODE_HEX}`;
}
