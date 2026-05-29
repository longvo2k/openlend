# OpenLend — Design Spec

**Project:** OpenLend (npm: `openlend`)
**Date:** 2026-05-29
**Status:** Approved (v1)
**Owner:** vvlong.2k@gmail.com

## 1. Purpose

**OpenLend** is a minimal, educational DeFi borrow-and-lend protocol
deployed on the IOPN testnet. Users supply native OPN to earn yield; borrowers post OPN as
collateral and borrow OPN at a fixed interest rate. Liquidators can close
unhealthy positions for a bonus.

Goals:
- Ship a working borrow/lend loop on IOPN testnet (chainId 984).
- Cover the full mechanics: supply, withdraw, collateral, borrow, repay,
  liquidate, interest accrual.
- Be small enough to read end-to-end (~250 LOC contract).

Non-goals (v1): frontend, price oracle, multiple assets, governance,
upgradeability, flash loans.

## 2. Target Network

| Field             | Value                                |
|-------------------|--------------------------------------|
| Network name      | IOPN Testnet                         |
| Chain ID          | 984 (0x3d8)                          |
| RPC URL           | https://testnet-rpc.iopn.tech        |
| Native token      | OPN                                  |
| Block explorer    | https://testnet.iopn.tech            |
| Faucet            | https://faucet.iopn.tech             |
| Min gas price     | 7 gwei                               |
| Block time        | ~1s, fast finality                   |
| EVM               | Full compatibility incl. Pectra      |

## 3. Stack

- Solidity ^0.8.24
- Hardhat + TypeScript
- ethers v6
- OpenZeppelin contracts (`ReentrancyGuard`, `Ownable`)
- Chai + Mocha tests (`@nomicfoundation/hardhat-toolbox`)
- `solidity-coverage` for coverage reports
- `dotenv` for env management

## 4. Repository Layout

```
iopn-builders/
├── contracts/
│   └── LendingPool.sol
├── test/
│   └── LendingPool.test.ts
├── scripts/
│   ├── deploy.ts
│   ├── supply.ts
│   ├── borrow.ts
│   ├── repay.ts
│   ├── withdraw.ts
│   └── liquidate.ts
├── deployments/                # gitignored except .gitkeep
│   └── iopnTestnet.json        # written on deploy
├── docs/
│   └── superpowers/specs/2026-05-29-iopn-lending-design.md   # OpenLend spec
├── hardhat.config.ts
├── tsconfig.json
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 5. Contract — `LendingPool.sol`

Single contract. Native OPN only. All amounts in wei (18 decimals).

### 5.1 Constants

| Name                 | Value | Meaning                                         |
|----------------------|-------|-------------------------------------------------|
| `RATE_BPS`           | 500   | 5.00% APR fixed, linear accrual                 |
| `LTV_BPS`            | 7500  | 75% max loan-to-value at borrow time            |
| `LIQ_THRESHOLD_BPS`  | 8000  | 80% threshold; below ⇒ liquidatable             |
| `LIQ_BONUS_BPS`      | 500   | 5% bonus to liquidator on seized collateral     |
| `BPS_DENOM`          | 10000 | basis-point denominator                         |
| `SECONDS_PER_YEAR`   | 31536000 | 365 * 24 * 3600                              |

### 5.2 Storage

```solidity
uint256 public totalSupplied;       // OPN in pool (incl. accrued interest)
uint256 public totalBorrowed;       // outstanding debt (incl. accrued)
uint256 public totalShares;         // supplier shares outstanding
uint256 public lastAccrual;         // timestamp of last interest accrual

mapping(address => uint256) public supplyShares;
mapping(address => uint256) public collateral;       // OPN posted
mapping(address => uint256) public borrowed;         // debt principal snapshot at last user interaction
mapping(address => uint256) public userBorrowIndex;  // global borrowIndex value at last interaction

uint256 public borrowIndex;          // global cumulative index, starts at 1e18
```

Interest is tracked globally via `borrowIndex` (Compound v2 pattern,
simplified to linear). Per-user debt = `borrowed[user] * borrowIndex / userBorrowIndex[user]`
on access.

### 5.3 External / Public Functions

All state-mutating functions are `nonReentrant` and call `_accrueInterest()`
first.

| Function                              | Notes                                                  |
|---------------------------------------|--------------------------------------------------------|
| `supply() external payable`           | Mint shares to `msg.sender` based on `exchangeRate()`. |
| `withdraw(uint256 shares) external`   | Burn shares, transfer OPN. Revert on insufficient liquidity. |
| `depositCollateral() external payable`| Increment `collateral[msg.sender]`.                    |
| `withdrawCollateral(uint256 amount) external` | Check post-withdrawal health factor ≥ 1.        |
| `borrow(uint256 amount) external`     | Mint debt; check LTV ≤ 75%; check pool liquidity.      |
| `repay() external payable`            | Reduce debt by `msg.value`; refund excess.             |
| `liquidate(address user) external payable` | Caller repays up to 50% of user's debt (close factor); receives collateral + 5% bonus. Only when HF < 1e18. |

### 5.4 View Functions

| Function                                  | Returns                                  |
|-------------------------------------------|------------------------------------------|
| `exchangeRate() public view`              | OPN per share, 1e18-scaled.              |
| `healthFactor(address user) public view`  | 1e18-scaled. HF < 1e18 ⇒ liquidatable.   |
| `debtOf(address user) public view`        | User debt incl. accrued interest.        |
| `availableLiquidity() public view`        | `totalSupplied - totalBorrowed`.         |
| `getAccountData(address user) external view` | (collateral, debt, hf, supplyShares)  |

### 5.5 Interest Accrual

Linear (not compounding) for v1 simplicity:

```
dt = block.timestamp - lastAccrual
interestFactor = (RATE_BPS * dt * 1e18) / (SECONDS_PER_YEAR * BPS_DENOM)
interest = totalBorrowed * interestFactor / 1e18
totalBorrowed += interest
totalSupplied += interest                 // suppliers earn 100% (no reserve in v1)
borrowIndex += borrowIndex * interestFactor / 1e18
lastAccrual = block.timestamp
```

### 5.6 Health Factor

Single asset means price is implicit (1:1). For user `u`:

```
debt = debtOf(u)
if debt == 0: return type(uint256).max
hf = collateral[u] * LIQ_THRESHOLD_BPS * 1e18 / (debt * BPS_DENOM)
```

LTV check at borrow uses the same shape with `LTV_BPS`.

### 5.7 Liquidation

Caller sends OPN via `msg.value`, capped by the close factor.
- Close factor: max 50% of user's current debt repayable per call.
- Excess `msg.value` above the cap is refunded.
- Seize collateral equal to `repaidAmount * (BPS_DENOM + LIQ_BONUS_BPS) / BPS_DENOM`.
- Revert if HF ≥ 1e18 (`HealthyPosition`).
- Revert if user has insufficient collateral to cover bonus (`InsufficientCollateral`).

### 5.8 Custom Errors

```solidity
error ZeroAmount();
error InsufficientLiquidity();
error InsufficientCollateral();
error Undercollateralized();
error HealthyPosition();
error NoDebt();
error TransferFailed();
error ExcessRepayment();
```

### 5.9 Events

```solidity
event Supplied(address indexed user, uint256 amount, uint256 shares);
event Withdrawn(address indexed user, uint256 amount, uint256 shares);
event CollateralDeposited(address indexed user, uint256 amount);
event CollateralWithdrawn(address indexed user, uint256 amount);
event Borrowed(address indexed user, uint256 amount);
event Repaid(address indexed user, uint256 amount);
event Liquidated(address indexed liquidator, address indexed user, uint256 repaid, uint256 seized);
event InterestAccrued(uint256 interest, uint256 newIndex);
```

## 6. Data Flow

```
Lender:      supply(OPN)        → shares↑, totalSupplied↑
             withdraw(shares)   → shares↓, OPN out (incl. interest)

Borrower:    depositCollateral(OPN)
             borrow(amount)     → debt↑, OPN out, check LTV
             repay()            → debt↓
             withdrawCollateral(amount) → check HF

Liquidator:  liquidate(user) when HF<1
             → repays up to 50% debt, receives collateral + 5% bonus

Time tick:   any state-mutating fn → _accrueInterest()
             → updates borrowIndex, totalBorrowed, totalSupplied
```

## 7. Error Handling & Safety

- All externals that transfer OPN are `nonReentrant`.
- Native transfers via `(bool ok,) = to.call{value: x}(""); if(!ok) revert TransferFailed();`
- Checks-effects-interactions: state changes before external transfer.
- No `selfdestruct`, no `delegatecall`, no external assembly.
- All integer math in 0.8.24 (overflow-checked).
- 50% close factor on liquidation to limit blast radius.
- No price oracle ⇒ no oracle-manipulation surface in v1.

## 8. Testing Strategy

Framework: Hardhat + Chai + `hardhat-network-helpers` (`time.increase`).

### 8.1 Test Suites

1. **Supply / Withdraw**
   - First supplier sets exchange rate 1:1
   - Multiple suppliers share interest pro-rata
   - Withdraw blocked when liquidity insufficient
   - Zero-amount supply reverts

2. **Collateral**
   - Deposit / withdraw paths
   - Withdraw blocked if HF would drop below 1

3. **Borrow**
   - LTV enforcement at borrow time
   - Liquidity check
   - Updates per-user borrow index

4. **Repay**
   - Partial repay
   - Full repay clears debt
   - Excess `msg.value` refunded

5. **Interest accrual**
   - After `time.increase(365 days)`, supplier balance grew by ~5%
   - Borrower debt grew by ~5%
   - Accrual is idempotent within same block

6. **Liquidation**
   - HF < 1 enables liquidation (forced by accrued interest over time)
   - Liquidator receives correct collateral + bonus
   - Healthy position cannot be liquidated
   - Close-factor cap (50%) enforced

7. **Security**
   - Reentrancy via malicious receiver contract on withdraw/borrow/liquidate
   - Direct ETH send (no fallback for arbitrary deposits — must use `supply`/`depositCollateral`)

Coverage target: ≥ 90% lines via `npx hardhat coverage`.

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
    gasPrice: 7_000_000_000, // 7 gwei min
  },
},
```

### 9.2 Deploy flow

1. `cp .env.example .env` and fill `PRIVATE_KEY`, optionally `IOPN_RPC_URL`.
2. Fund deployer via `https://faucet.iopn.tech`.
3. `npm run compile`
4. `npm run test` (local hardhat)
5. `npm run deploy:testnet` → runs `scripts/deploy.ts` against `iopnTestnet`
6. Script writes address + ABI hash to `deployments/iopnTestnet.json`.
7. Explorer verification: attempt Sourcify / Etherscan-style verify if a
   compatible endpoint is exposed by `testnet.iopn.tech`. If not exposed,
   document manual flattening + upload as fallback in README. (To be
   confirmed during implementation.)

### 9.3 Interaction scripts

Each script reads the deployed address from `deployments/iopnTestnet.json`
and signs with the env private key. Examples:

```
npx hardhat run scripts/supply.ts --network iopnTestnet -- 1.0
npx hardhat run scripts/borrow.ts --network iopnTestnet -- 0.5
```

Args parsed from process.argv after `--`.

## 10. Environment & Secrets

`.env.example`:
```
PRIVATE_KEY=0xYOUR_TESTNET_KEY
IOPN_RPC_URL=https://testnet-rpc.iopn.tech
```

`.gitignore` excludes `.env`, `node_modules`, `cache`, `artifacts`,
`coverage`, `typechain-types`, `deployments/*.json` except `.gitkeep`.

## 11. Open Questions for Implementation

1. Does IOPN testnet expose an Etherscan-compatible verify API or
   Sourcify endpoint? Confirm during deploy; pick verification path then.
2. Confirm 7 gwei is sufficient under testnet load; bump if tx stuck.

These are confirm-during-impl, not design blockers.

## 12. Out of Scope (v1)

- Frontend (Next.js dApp) — planned as v2
- Multiple assets (stablecoin debt, ERC20 collateral)
- Price oracle (Chainlink/Pyth)
- Dynamic / kinked interest rate model
- Reserve factor / protocol fees
- Governance, upgradeability, timelocks
- Flash loans
- Cross-chain / IBC

## 13. Acceptance Criteria

- `npm run test` passes with ≥ 90% line coverage.
- Contract deploys to IOPN testnet from a single command.
- All five interaction scripts (supply, withdraw, borrow, repay, liquidate)
  run end-to-end against the live testnet deployment.
- README documents setup, deploy, and interaction in under 5 minutes for a
  fresh clone.
