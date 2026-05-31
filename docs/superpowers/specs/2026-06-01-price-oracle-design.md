# PriceOracle v1

Date: 2026-06-01
Status: Design approved, ready for implementation plan

## Summary

A standalone, admin-set price oracle for the OPN/mUSDC pair on IOPN testnet. Owner proposes a new price; after a one-hour timelock the owner commits it. Public reads are free. No contract consumers in v1: the goal is to ship the oracle infrastructure (contract + deploy + Hardhat scripts + frontend badge) so the future multi-asset lending upgrade has a price source to consume.

This is the testnet-stopgap path called out in the ROADMAP caveat. Pyth is not deployed on IOPN at its known canonical addresses, verified 2026-06-01. The owner is single-key (the existing deployer) using OpenZeppelin v5 `Ownable`. A future multi-asset rewrite can replace this oracle with a price registry, a TWAP, or an external feed without disturbing the rest of the protocol.

## Goals

- Stand up the smallest honest oracle that proves the propose-then-commit pattern works on IOPN.
- Read interface (`getPrice() returns (uint256)`) that multi-asset lending can adopt later without changes to the consumer side.
- Surface the current price in the dApp so a user can sanity-check that the oracle is alive.
- Keep contract surface tiny: one storage word for current price, one for pending price, one for unlock time. Fits comfortably in a single file under 150 lines.

## Non-goals

- LendingPool integration. The oracle is read by nothing in v1 except the frontend badge.
- Multi-asset price registry (`mapping(address => uint256)`). Defer to the multi-asset lending rewrite; a fresh oracle is cheaper than extending this one.
- Quote-pair API (`getPrice(base, quote)`). Overkill for a single OPN/mUSDC pair.
- Frontend admin UI for proposing or committing. Owner uses Hardhat scripts.
- Price history chart, owner-changeable timelock, multisig owner. All deferred.
- Slashing or attestation by external watchers. Out of scope for a testnet stopgap.

## Price semantics

`currentPrice` is a `uint256` representing **mUSDC per 1 OPN, scaled by 1e18**. So a price of `100 * 1e18` means 100 mUSDC per OPN.

The 1e18 scaling matches the project's existing internal conventions (HF math, borrowIndex). It also leaves headroom for sub-cent precision when consumed by future cross-asset HF calculations.

The choice of mUSDC as the quote currency (rather than USD) is deliberate: mUSDC is the only stable asset in the system and serves as the implicit unit-of-account. The oracle does not claim to know the USD price of OPN; it claims to know the mUSDC price.

## Architecture

### Contract: `contracts/PriceOracle.sol`

Solidity 0.8.24, inherits OpenZeppelin v5 `Ownable` only. No reentrancy guard (state changes precede event emits, no external calls).

State:

```solidity
uint256 public currentPrice;        // mUSDC per OPN, 1e18-scaled
uint256 public pendingPrice;
uint256 public pendingUnlockTime;   // 0 when no proposal pending
```

Constant:

```solidity
uint256 public constant TIMELOCK_DELAY = 1 hours;
```

Constructor:

```solidity
constructor(uint256 initialPrice) Ownable(msg.sender) {
    require(initialPrice > 0, "PriceOracle: initial price must be > 0");
    currentPrice = initialPrice;
}
```

The constructor sets the genesis price directly. No timelock applies to genesis. Deploy script supplies the initial price from the OpenSwapPair spot ratio at deploy time.

Functions (all `external`):

| Function | Access | Behavior |
|---|---|---|
| `getPrice() view returns (uint256)` | anyone | returns `currentPrice` |
| `pendingProposal() view returns (uint256 newPrice, uint256 unlockTime, bool canCommit)` | anyone | snapshot for UI; `canCommit = unlockTime > 0 && block.timestamp >= unlockTime` |
| `proposeNewPrice(uint256 newPrice)` | onlyOwner | requires `newPrice > 0`; requires no pending proposal (must `cancelProposal` first); sets `pendingPrice = newPrice`, `pendingUnlockTime = block.timestamp + TIMELOCK_DELAY`; emits `PriceProposed` |
| `cancelProposal()` | onlyOwner | requires a pending proposal exists; clears `pendingPrice` and `pendingUnlockTime`; emits `PriceProposalCanceled(canceledPrice)` |
| `commitNewPrice()` | onlyOwner | requires `pendingUnlockTime > 0` (proposal exists) and `block.timestamp >= pendingUnlockTime`; sets `currentPrice = pendingPrice`; clears pending state; emits `PriceCommitted` |

Events:

```solidity
event PriceProposed(uint256 newPrice, uint256 unlockTime);
event PriceCommitted(uint256 oldPrice, uint256 newPrice);
event PriceProposalCanceled(uint256 canceledPrice);
```

Errors use require-string style to match the project's existing contract idioms (LendingPool, OpenSwapPair both use require strings, not custom errors).

### Tests: `test/PriceOracle.test.ts`

Mocha + chai via `@nomicfoundation/hardhat-toolbox`, identical patterns to `test/LendingPool.test.ts`.

Coverage targets:

- **Construction**: stores `initialPrice`, `pendingUnlockTime == 0`, owner == deployer; reverts on `initialPrice == 0`.
- **Propose**: stores `pendingPrice` and computes `pendingUnlockTime = now + 1h`; emits `PriceProposed`. Reverts when a proposal already pending. Reverts when not owner.
- **Cancel**: clears pending state; emits `PriceProposalCanceled(canceledPrice)`. Reverts when no pending. Reverts when not owner.
- **Commit pre-unlock**: reverts before `pendingUnlockTime` elapses (use `hardhat_increaseTime` minus 1 second to test the boundary).
- **Commit at unlock**: at exactly `pendingUnlockTime` succeeds. Updates `currentPrice`; clears pending state; emits `PriceCommitted(oldPrice, newPrice)`.
- **Commit no-pending**: reverts when called without a pending proposal.
- **Commit non-owner**: reverts.
- **Multi-cycle**: propose → commit → propose-again → commit-again works. Verifies no state leakage between cycles.
- **`pendingProposal` view**: returns correct tuple before unlock (`canCommit = false`), at unlock (`canCommit = true`), after commit (`unlockTime = 0`).

Target ≥ 90% line coverage to match the project's standard.

### Deploy: extend `scripts/deploy.ts`

Append a fourth deployment block after the existing three (LendingPool, MockUSDC, OpenSwapPair):

1. Read the current OpenSwapPair reserves via `pair.getReserves()` → `(reserveOPN, reserveMUSDC, _)`.
2. Compute initial price: `initialPrice = (reserveMUSDC * 1e18) / reserveOPN`. Cross-decimal note: reserveMUSDC is 6-decimal wei, reserveOPN is 18-decimal wei. The formula `(reserveMUSDC_e6 * 1e18) / reserveOPN_e18` yields mUSDC-per-OPN in 1e6 scale, which is **not** what we want. Compute as `(reserveMUSDC * 1e30) / reserveOPN` to land at 1e18-scaled mUSDC-per-OPN. The plan must include unit tests for this conversion in the deploy script's preflight log line.
3. If reserves are zero (pre-bootstrap), fall back to a sentinel `100 * 1e18` (100 mUSDC per OPN) so the deploy never reverts.
4. Deploy `PriceOracle` with `initialPrice` and log it.
5. Add `priceOracle: <address>` to the deployments JSON, preserving prior fields.

### Hardhat interaction scripts

Four new scripts under `scripts/`, each taking address from `deployments/iopnTestnet.json`:

- `oracle-propose.ts <newPrice>` — argv `<newPrice>` is a decimal string of mUSDC per OPN (e.g. `"100.50"`); script parses to 1e18 wei, calls `proposeNewPrice`. Logs proposal hash and unlock time.
- `oracle-commit.ts` — calls `commitNewPrice`. Logs old → new price.
- `oracle-cancel.ts` — calls `cancelProposal`. Logs canceled price.
- `oracle-show.ts` — read-only. Prints `currentPrice` (formatted), `pendingPrice`, `pendingUnlockTime`, `canCommit`, and seconds-until-unlock.

`package.json` adds:

```json
"oracle:propose": "hardhat run scripts/oracle-propose.ts --network iopnTestnet",
"oracle:commit":  "hardhat run scripts/oracle-commit.ts  --network iopnTestnet",
"oracle:cancel":  "hardhat run scripts/oracle-cancel.ts  --network iopnTestnet",
"oracle:show":    "hardhat run scripts/oracle-show.ts    --network iopnTestnet"
```

### Frontend

`frontend/lib/abi/PriceOracle.json` — bundled ABI copied from artifacts after compile.

`frontend/lib/contract.ts` — add two new exports, both following the static-`process.env` literal-access pattern (required for Next.js inlining per CLAUDE.md):

```ts
export const priceOracleAbi = PriceOracleJson.abi;

export function getPriceOracleAddress(chainId: number): Hex | null {
  if (chainId === 984) return check(process.env.NEXT_PUBLIC_PRICE_ORACLE_TESTNET);
  if (chainId === 31337) return check(process.env.NEXT_PUBLIC_PRICE_ORACLE_LOCAL);
  return null;
}
```

`frontend/.env.example` — append two keys: `NEXT_PUBLIC_PRICE_ORACLE_TESTNET` and `NEXT_PUBLIC_PRICE_ORACLE_LOCAL`.

`frontend/scripts/sync-address.mjs` — extend the `setKey` calls to include `NEXT_PUBLIC_PRICE_ORACLE_<SUFFIX>` from `deployment.priceOracle`.

`frontend/components/OraclePriceBadge.tsx` — new component, ~60 LOC:

- Two `useReadContract` calls: `getPrice` and `pendingProposal`. Both with `refetchInterval: 30_000`, `staleTime: 15_000`. Same idioms as other panels.
- Renders one row inside an existing PoolStats card slot:
  - `"OPN price (oracle): {currentPrice} mUSDC · updated {Yh ago}"`
  - If `pendingProposal.canCommit === false && pendingProposal.unlockTime > 0`: append `"· next update unlocks in {Zm}"`
  - If `pendingProposal.canCommit === true`: append `"· pending update ready to commit"`
- "updated Yh ago" computed from the most recent `PriceCommitted` event timestamp (read via the explorer API in one HTTP call, same pattern as `lib/history.ts` and `lib/pool-history.ts`). On chains without an explorer base (hardhat), omit the relative time.
- Loading skeleton: gray pill placeholder of similar width.
- Error: silent fallback to `"OPN price (oracle): unavailable"`. Do not crash the parent PoolStats row.

`frontend/components/PoolStats.tsx` — modify to embed `OraclePriceBadge` as a new row at the bottom of the stats grid.

### Documentation

- `README.md` — add a short subsection under the "Frontend" section describing the oracle badge and the four Hardhat commands.
- `ROADMAP.md` — drop the Price oracle bullet on ship (per the no-Shipped-section rule). Permit2 and Looper remain in Q4.

## File-by-file impact

```
contracts/PriceOracle.sol                          # new (~120 LOC)
test/PriceOracle.test.ts                           # new (~250 LOC)
scripts/deploy.ts                                  # modified: +PriceOracle deploy + pool-ratio initial price
scripts/oracle-propose.ts                          # new (~40 LOC)
scripts/oracle-commit.ts                           # new (~25 LOC)
scripts/oracle-cancel.ts                           # new (~25 LOC)
scripts/oracle-show.ts                             # new (~50 LOC)
package.json                                       # +4 npm scripts
frontend/lib/abi/PriceOracle.json                  # new (bundled ABI)
frontend/lib/contract.ts                           # +getPriceOracleAddress, +priceOracleAbi
frontend/.env.example                              # +2 keys
frontend/scripts/sync-address.mjs                  # +priceOracle key
frontend/components/OraclePriceBadge.tsx           # new (~80 LOC)
frontend/components/PoolStats.tsx                  # +OraclePriceBadge row
README.md                                          # addendum
ROADMAP.md                                         # drop Price oracle bullet
```

## Conventions

- Solidity require-string style errors (match existing LendingPool, OpenSwapPair)
- 1e18 scaling for price
- 1-hour timelock as constant
- OZ Ownable for owner (single key, deployer)
- Bundled ABIs (`frontend/lib/abi/*.json`) per existing frontend pattern
- Static `process.env.NEXT_PUBLIC_X` access in `contract.ts` per the CLAUDE.md rule
- Lucide icons only in the frontend (no inline SVG)
- No em-dashes in submission-form content (this spec is internal docs, em-dashes acceptable, but the README addendum follows the rule)

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Owner key compromise causes a malicious price update | 1-hour timelock gives users a window to react. Acceptable risk on testnet. Production rewrite needs multisig + longer timelock. |
| Initial price diverges from pool spot at deploy | Compute initial from `pair.getReserves()` at deploy. Pre-bootstrap fallback is documented sentinel `100 * 1e18`. |
| Decimal conversion bug in deploy-time initial price | Spec calls out the `(reserveMUSDC * 1e30) / reserveOPN` formula explicitly. Plan must include a manual log-line verification step. |
| Frontend reads stale price after a commit | TanStack Query refetch every 30s; user can also hard-refresh. Acceptable for testnet. |
| Explorer API call for "updated Yh ago" times out | Silent fallback to omitting the relative time. Badge still renders with current price. |

## Out of scope (deferred to future phases)

- LendingPool consumption (waits for multi-asset HF rewrite)
- Multi-asset registry or quote-pair API (rebuild when multi-asset lands)
- Frontend admin UI for proposing/committing
- Multisig owner + owner-changeable timelock
- Price history chart on Dashboard
- External attestation / slashing / dispute mechanism
- Pyth or Chainlink integration once they ship on IOPN

## Open questions

None. All five design knobs settled during brainstorming: standalone scope, single price, 1-hour timelock, Lending Dashboard badge surface, OZ Ownable single-key.
