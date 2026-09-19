// Testnet only. Never mainnet.
export const HORIZON_URL = 'https://horizon-testnet.stellar.org'
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
export const FRIENDBOT_URL = 'https://friendbot.stellar.org'
export const EXPLORER_ACCOUNT_URL = 'https://stellar.expert/explorer/testnet/account/'
export const EXPLORER_TX_URL = 'https://stellar.expert/explorer/testnet/tx/'

/** Asset code of the pet token. `PET1:<issuer>` is the pet's permanent ID. */
export const PET_ASSET_CODE = 'PET1'

/** manageData keys. Max 64 bytes each. */
export const DATA_KEYS = {
  name: 'pet.name',
  species: 'pet.species',
  care: 'pet.care',
  prev: 'pet.prev',
} as const

/** Text memo prefix for gift payments, e.g. `treat:apple`. Memo max 28 bytes. */
export const TREAT_MEMO_PREFIX = 'treat:'

/**
 * Demo clock. Multiplies ELAPSED time in the engine so judges see change in
 * minutes. Never touches on-chain data. Default 1 = real time.
 */
export const TIME_SCALE = Math.max(1, Number(import.meta.env.VITE_TIME_SCALE ?? '1') || 1)
