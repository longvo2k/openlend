# OpenSwap — Design Spec (v1)

**Project:** OpenSwap (npm: `openswap`)
**Date:** 2026-05-29
**Status:** Approved (v1)
**Owner:** vvlong.2k@gmail.com
**Sibling project:** [OpenLend](https://github.com/longvo2k/openlend) — same builder, same chain

## 1. Purpose

**OpenSwap** is a minimal UniV2-style constant-product AMM deployed on the
IOPN testnet. A single pool trades native **OPN** against a mock USD
stablecoin (**mUSDC**). LPs add liquidity to earn the 0.30% swap fee;
traders swap between the two assets.

Goals:
- Ship a working AMM with the full add/remove/swap loop on IOPN testnet.
- Two contracts only (Pair + MockUSDC) — small enough to read end-to-end.
- Sibling DeFi primitive to [OpenLend](https://github.com/longvo2k/openlend);
  together they demonstrate that the canonical money-market + DEX pair ports
  cleanly to IOPN's EVM.

Non-goals (v1): factory, router, multi-hop, multi-pair, frontend, TWAP
oracle accumulator, flash swaps, protocol-fee toggle, WOPN wrapping.

## 2. Target Network

| Field             | Value                                |
|-------------------|--------------------------------------|
| Network name      | IOPN Testnet                         |
| Chain ID          | 984 (0x3d8)                          |
| RPC URL           | https://testnet-rpc.iopn.tech        |
| Native token      | OPN (18 decimals)                    |
| Block explorer    | https://testnet.iopn.tech            |
| Faucet            | https://faucet.iopn.tech             |
| Min gas price     | 7 gwei                               |
| EVM               | Full compatibility incl. Pectra      |

## 3. Stack

- Solidity ^0.8.24
- Hardhat + TypeScript
- ethers v6
- OpenZeppelin Contracts v5 (`ERC20`, `ReentrancyGuard`)
- Chai + Mocha (`@nomicfoundation/hardhat-toolbox`)
- `solidity-coverage`
- `dotenv`

## 4. Repository Layout

```
openswap/
├── contracts/
│   ├── OpenSwapPair.sol         # AMM + LP token (single contract)
│   ├── MockUSDC.sol             # ERC20, 6 decimals, open faucet
│   └── test/
│       └── MaliciousReceiver.sol  # reentrancy attacker (tests only)
├── test/
│   ├── OpenSwapPair.test.ts
│   └── MockUSDC.test.ts
├── scripts/
│   ├── deploy.ts                # mUSDC + Pair, writes deployments/<net>.json
│   ├── add-liquidity.ts
│   ├── remove-liquidity.ts
│   ├── swap-opn-for-musdc.ts
│   ├── swap-musdc-for-opn.ts
│   └── faucet.ts                # mint mUSDC to caller
├── deployments/                 # gitignored except .gitkeep
│   └── .gitkeep
├── docs/superpowers/specs/2026-05-29-openswap-design.md
├── hardhat.config.ts
├── tsconfig.json
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

Mirror of OpenLend's layout. Anyone who's read OpenLend can navigate this in
seconds.

## 5. Contracts

### 5.1 `MockUSDC.sol`

Plain ERC20 with an open faucet for testnet liquidity.

```solidity
contract MockUSDC is ERC20 {
    uint256 public constant MAX_MINT_PER_CALL = 10_000 * 1e6;  // 10k mUSDC
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(uint256 amount) external {
        require(amount > 0 && amount <= MAX_MINT_PER_CALL, "amount");
        _mint(msg.sender, amount);
    }
}
```

- **Decimals: 6** (matches real USDC).
- **Open faucet:** any address can call `mint(amount)` capped at 10,000
  mUSDC per call.
- No admin, no upgrade, no pause. Testnet-only by intent.

### 5.2 `OpenSwapPair.sol`

The AMM. Inherits `ERC20` so the LP token (`OpenSwap LP`, symbol `OSP-LP`,
18 decimals) is the pair itself — standard UniV2 pattern.

#### 5.2.1 Constants

| Name                  | Value | Meaning                                  |
|-----------------------|-------|------------------------------------------|
| `MINIMUM_LIQUIDITY`   | 1000  | Wei-LP locked to `address(0)` on first add |
| `FEE_NUM`             | 997   | Numerator of 1 − fee                     |
| `FEE_DEN`             | 1000  | Denominator (so fee = 3/1000 = 0.30%)    |

#### 5.2.2 Storage

```solidity
IERC20 public immutable mUSDC;          // set in constructor
uint112 public reserveOPN;              // packed slot 0
uint112 public reserveMUSDC;            // packed slot 0
uint32  public blockTimestampLast;      // packed slot 0 (reserved, no TWAP in v1)
// LP token state inherited from ERC20
```

`reserveOPN/MUSDC/blockTimestampLast` packed into a single 256-bit slot
(112 + 112 + 32 = 256). Saves one SSTORE per state change vs unpacked
fields.

#### 5.2.3 External / Public Functions

All state-mutating functions are `nonReentrant`.

| Function | Notes |
|----------|-------|
| `addLiquidity(uint256 mUSDCIn) external payable returns (uint256 lpMinted)` | First add: `lpMinted = sqrt(opnIn × mUSDCIn) − MINIMUM_LIQUIDITY`. Subsequent add: `min(opnIn × supply / reserveOPN, mUSDCIn × supply / reserveMUSDC)`. |
| `removeLiquidity(uint256 lpAmount) external returns (uint256 opnOut, uint256 mUSDCOut)` | Burn LP, receive pro-rata reserves. |
| `swapOPNForMUSDC(uint256 minOut) external payable returns (uint256 amountOut)` | OPN in via `msg.value`. Slippage-guarded. |
| `swapMUSDCForOPN(uint256 mUSDCIn, uint256 minOut) external returns (uint256 amountOut)` | mUSDC in via `transferFrom`. Slippage-guarded. |

#### 5.2.4 View Functions

| Function | Returns |
|----------|---------|
| `getReserves() external view` | `(uint112 reserveOPN, uint112 reserveMUSDC, uint32 blockTimestampLast)` |
| `quoteSwap(uint256 amountIn, bool opnIsInput) external view` | `uint256 amountOut` — applies fee, reads reserves |
| `quoteAddLiquidity(uint256 opnIn, uint256 mUSDCIn) external view` | `(uint256 lpToMint, uint256 opnUsed, uint256 mUSDCUsed)` — preview before tx |

#### 5.2.5 AMM Math

**Constant product invariant:**
```
reserveOPN × reserveMUSDC = k    (must not decrease except on liquidity events)
```

**Swap formula:**
```
amountInWithFee = amountIn × FEE_NUM / FEE_DEN
amountOut       = (amountInWithFee × reserveOut) / (reserveIn + amountInWithFee)
```

Fee stays in the pool. LPs accumulate value as `k` grows over time.

**First-time liquidity (bootstrap):**
```
lpMinted = sqrt(opnIn × mUSDCIn) − MINIMUM_LIQUIDITY
```
`MINIMUM_LIQUIDITY` (1000 wei-LP) is minted to `address(0)` so `totalSupply`
can never return to zero. Prevents the share-inflation attack on an empty
pool (Uniswap's standard defense).

**Subsequent liquidity:**
```
lpMinted = min(
    (opnIn   × totalSupply) / reserveOPN,
    (mUSDCIn × totalSupply) / reserveMUSDC
)
```
Caller must deposit both assets in current ratio; off-ratio adds cost the
caller. v1 has **no router**, so the caller is responsible for figuring
out the right pair-up.

**Remove liquidity (pro-rata):**
```
opnOut   = (lpAmount × reserveOPN)   / totalSupply
mUSDCOut = (lpAmount × reserveMUSDC) / totalSupply
```

**Decimals:** OPN is 18-decimals, mUSDC is 6-decimals. Math operates on
raw integer units throughout — no scaling inside the contract. CLI and
future UI handle display formatting.

#### 5.2.6 Custom Errors

```solidity
error ZeroAmount();
error InsufficientLiquidity();
error InsufficientLPMinted();
error InsufficientOutput();      // slippage breach
error InvariantViolated();       // k_after < k_before (defensive)
error TransferFailed();
error Overflow();                // uint112 cast guard on reserves
```

#### 5.2.7 Events

```solidity
event Mint(address indexed provider, uint256 opnIn, uint256 mUSDCIn, uint256 lpMinted);
event Burn(address indexed provider, uint256 opnOut, uint256 mUSDCOut, uint256 lpBurned);
event Swap(address indexed trader, bool opnIsInput, uint256 amountIn, uint256 amountOut);
event Sync(uint112 reserveOPN, uint112 reserveMUSDC);   // emitted after every state change
```

`Sync` mirrors UniV2; indexers rely on it to reconstruct pool state.

## 6. Data Flow

```
LP add:    addLiquidity(mUSDC)   payable(OPN) → mint LP, update reserves
LP remove: removeLiquidity(LP)                → burn LP, send OPN + mUSDC

Swap OPN → mUSDC:
   swapOPNForMUSDC(minOut) payable(OPN)
   → fee retained, send mUSDC, update reserves, emit Swap + Sync

Swap mUSDC → OPN:
   approve(pair, mUSDCIn) → swapMUSDCForOPN(mUSDCIn, minOut)
   → pull mUSDC, fee retained, send OPN, update reserves
```

State updates use checks-effects-interactions: validate amounts → mutate
reserves → external transfers last. Invariant `reserveOPN × reserveMUSDC`
is re-checked after every swap and the call reverts if it decreased.

## 7. Safety Model

- **ReentrancyGuard** on all four state-mutating externals.
- **Native OPN transfers:** `(bool ok,) = to.call{value: x}(""); if (!ok) revert TransferFailed();`
- **mUSDC transfers:** `SafeERC20` from OpenZeppelin for `transfer`/`transferFrom`.
- **Invariant check** after swaps: recompute `reserveOPN × reserveMUSDC` and
  revert with `InvariantViolated` if strictly less than pre-swap product.
  Belt-and-suspenders against rounding or fee miscompute.
- **Slippage:** caller passes `minOut`; revert `InsufficientOutput` if
  `amountOut < minOut`. Standard UniV2 protection.
- **MINIMUM_LIQUIDITY lock:** first LP loses 1000 wei-LP to dead address.
- **uint112 overflow guard:** reserves cast back to uint112 on every
  update; revert `Overflow` on cast failure.
- **No admin keys** — no pause, no upgrade, no parameter setters.
  Immutable by intent, same posture as OpenLend.

## 8. Testing Strategy

Framework: Hardhat + Chai + `hardhat-network-helpers`.

### 8.1 Test Suites

1. **MockUSDC**
   - Mint up to `MAX_MINT_PER_CALL` succeeds, over cap reverts
   - Standard ERC20 transfer/approve/transferFrom
   - `decimals() == 6`

2. **OpenSwapPair — liquidity**
   - First add: `lpMinted = sqrt(opnIn × mUSDCIn) − 1000`
   - 1000 wei-LP locked to `address(0)`
   - Subsequent add at current ratio: LP shares pro-rata
   - Add at off-ratio: caller receives `min(...)` of the two ratios
   - Remove burns pro-rata, returns both assets
   - First add must mint > 0 LP after locking minimum, else revert

3. **OpenSwapPair — swap**
   - `swapOPNForMUSDC`: out matches formula within rounding
   - `swapMUSDCForOPN`: out matches formula within rounding
   - 0.30% fee retained: `k` strictly grows on every swap
   - `minOut` slippage check: revert `InsufficientOutput` if breached
   - Zero amount → `ZeroAmount`
   - Swap with empty reserves → `InsufficientLiquidity`
   - Invariant: `k_after ≥ k_before` always

4. **Reentrancy**
   - `MaliciousReceiver` attempts re-entry on swap callback → reverts via
     ReentrancyGuard

5. **View functions**
   - `quoteSwap` matches actual swap output exactly
   - `quoteAddLiquidity` matches actual `addLiquidity` result
   - `getReserves` returns packed slot correctly

Coverage target: ≥ 90% line coverage via `npx hardhat coverage`.

### 8.2 Local-only

All tests run against Hardhat's in-process EVM. No testnet calls in CI.

## 9. Deployment

### 9.1 Hardhat network config

```ts
// hardhat.config.ts (sketch)
networks: {
  iopnTestnet: {
    url: process.env.IOPN_RPC_URL ?? "https://testnet-rpc.iopn.tech",
    chainId: 984,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    gasPrice: 7_000_000_000,
  },
},
```

### 9.2 Deploy flow

1. `cp .env.example .env` and fill `PRIVATE_KEY`.
2. Fund deployer via https://faucet.iopn.tech.
3. `npm run compile && npm run test && npm run coverage`.
4. `npm run deploy:testnet`:
   - Deploy `MockUSDC` first.
   - Deploy `OpenSwapPair(address(MockUSDC))` second.
   - Write both addresses to `deployments/iopnTestnet.json`.
5. Bootstrap liquidity (one-time):
   ```
   npm run faucet -- 100000
   npm run add-liquidity -- 10 1000        # 10 OPN + 1000 mUSDC
   ```

### 9.3 Interaction scripts

Each script reads addresses from `deployments/iopnTestnet.json` and signs
with the env private key.

| Script | Args |
|--------|------|
| `faucet.ts` | `<mUSDCAmount>` |
| `add-liquidity.ts` | `<opnAmount> <mUSDCAmount>` |
| `remove-liquidity.ts` | `<lpAmount>` |
| `swap-opn-for-musdc.ts` | `<opnAmountIn> <minMUSDCOut>` |
| `swap-musdc-for-opn.ts` | `<mUSDCAmountIn> <minOPNOut>` |

## 10. Environment & Secrets

`.env.example`:
```
PRIVATE_KEY=0xYOUR_TESTNET_KEY
IOPN_RPC_URL=https://testnet-rpc.iopn.tech
```

`.gitignore` excludes `.env`, `node_modules`, `cache`, `artifacts`,
`coverage`, `typechain-types`, `deployments/*.json` except `.gitkeep`.

## 11. Open Questions

1. Does IOPN testnet expose Etherscan-compatible verification? Confirm
   during deploy; same fallback as OpenLend (flatten + manual upload).
2. Confirm 7 gwei holds under testnet load.

Confirm-during-implementation, not design blockers.

## 12. Out of Scope (v1)

- Frontend (CLI only; mirrors OpenLend v1)
- Factory / multi-pair
- Router / multi-hop swaps
- TWAP price accumulator
- Flash swaps (UniV2 has `swap` callback; we use specific `swapXForY` fns
  with no callback)
- Protocol-fee toggle
- WOPN wrapped token
- Permit (ERC2612) on the LP token

## 13. Acceptance Criteria

- `npm run test` passes with ≥ 90% line coverage on `OpenSwapPair.sol`.
- `npm run deploy:testnet` deploys both `MockUSDC` and `OpenSwapPair` from
  a single command.
- All 5 interaction scripts (`faucet`, `add-liquidity`, `remove-liquidity`,
  `swap-opn-for-musdc`, `swap-musdc-for-opn`) run end-to-end against the
  live testnet deployment.
- After bootstrap liquidity, `swapOPNForMUSDC` returns within 0.3% of the
  theoretical AMM output for a non-trivial trade size.
- README documents setup, deploy, and interaction in under 5 minutes for a
  fresh clone.

## 14. Relationship to OpenLend

OpenSwap is a **sibling primitive**, not a dependency. Both share:

- Builder, chain, design language (`MAX` button, accent colors, dark UI)
- Stack: Solidity 0.8.24, Hardhat + TS, OZ v5, ReentrancyGuard, custom
  errors
- Project layout (mirrors OpenLend's `contracts/test/scripts/` structure)

Together they demonstrate that the **canonical money-market + DEX pair**
ports cleanly to IOPN. A future v2 could compose them — borrow mUSDC on
OpenLend, swap to OPN on OpenSwap = effective short on mUSDC. That
composition is out of scope for OpenSwap v1.
