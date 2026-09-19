export const inputClass =
  'w-full rounded-lg border-2 border-[#2b2140] bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-pink-300 disabled:opacity-50'

export function isPublicKey(s: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(s.trim())
}
