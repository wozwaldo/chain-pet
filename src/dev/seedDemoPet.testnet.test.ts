// Seeds a demo pet on TESTNET with a throwaway key, through the app's own tx builders.
// Run: SEED_DEMO=1 pnpm exec vitest run src/dev/seedDemoPet.testnet.test.ts
// Prints the owner address (open /?view=<address>) and the throwaway secret so you can
// import it into Freighter for a demo. Disposable testnet key only; never a real one.
import { describe, expect, it } from 'vitest'
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk'
import { NETWORK_PASSPHRASE } from '../stellar/config'
import { fundWithFriendbot } from '../stellar/horizon'
import { careOp, giftMemo, giftOp, hatchOps, submitOps, type Signer } from '../stellar/tx'
import { loadPetByAccount } from '../pet/chain'

// tsconfig.app.json only loads vite/client types, so read process.env without @types/node.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

function keypairSigner(kp: Keypair): Signer {
  return async (xdr) => {
    const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE)
    tx.sign(kp)
    return tx.toXDR()
  }
}

async function fund(pk: string) {
  for (let i = 0; i < 4; i++) {
    try {
      await fundWithFriendbot(pk)
      return
    } catch (err) {
      if (i === 3) throw err
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
    }
  }
}

describe.skipIf(!env.SEED_DEMO)('seed demo pet', () => {
  it('creates an owner with a cared-for pet and a friend who sent a treat', async () => {
    const owner = Keypair.random()
    const friend = Keypair.random()
    await Promise.all([fund(owner.publicKey()), fund(friend.publicKey())])
    const signO = keypairSigner(owner)
    const signF = keypairSigner(friend)

    await submitOps(owner.publicKey(), hatchOps(env.SEED_NAME ?? 'Mochi', 'tanuki'), signO)
    await submitOps(owner.publicKey(), [careOp('feed')], signO)
    await submitOps(owner.publicKey(), [careOp('play')], signO)
    await submitOps(owner.publicKey(), [careOp('clean')], signO)
    await submitOps(friend.publicKey(), [giftOp(owner.publicKey(), '0.5000000')], signF, { memo: giftMemo('cookie') })

    const pet = await loadPetByAccount(owner.publicKey())
    expect(pet?.relation).toBe('owner')
    expect(pet?.record.care.map((c) => c.kind)).toEqual(['feed', 'play', 'clean'])
    expect(pet?.record.gifts.map((g) => g.kind)).toEqual(['cookie'])

    const summary = [
      `DEMO_OWNER_ADDRESS=${owner.publicKey()}`,
      `DEMO_OWNER_SECRET=${owner.secret()}  (throwaway testnet key, import into Freighter for a demo)`,
      `DEMO_FRIEND_ADDRESS=${friend.publicKey()}`,
      `Open: http://localhost:5173/?view=${owner.publicKey()}`,
    ].join('\n')
    console.log('\n' + summary + '\n')
    if (env.SEED_OUT) {
      // @ts-expect-error tsconfig.app.json has no node types; vitest runs this in Node.
      const { writeFileSync } = await import('node:fs')
      writeFileSync(env.SEED_OUT, summary + '\n')
    }
  }, 180_000)
})
