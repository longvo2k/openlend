export interface GlossaryEntry {
  term: string;
  short: string;
  full?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  LP: {
    term: 'LP (Liquidity Provider)',
    short: 'You deposit two tokens into a pool. In return you get LP tokens proving your share.',
    full: 'When you trade, LPs earn a cut of every swap fee (0.30% here), split by share.',
  },
  AMM: {
    term: 'AMM (Automated Market Maker)',
    short: 'A robot trader. Prices come from a formula (x * y = k), not a buyer/seller order book.',
  },
  Pool: {
    term: 'Pool',
    short: 'A shared pot of tokens that others can swap against or borrow from.',
  },
  Slippage: {
    term: 'Slippage',
    short: 'The price can move between when you click and when the trade goes through. Slippage is how much worse the final price is allowed to be.',
  },
  Reserves: {
    term: 'Reserves',
    short: 'The actual token balances sitting inside a pool right now.',
  },
  Collateral: {
    term: 'Collateral',
    short: 'Tokens you lock up as security so you can borrow against them.',
  },
  LTV: {
    term: 'LTV (Loan-to-Value)',
    short: 'Max % of your collateral you can borrow. 75% means $100 deposited → $75 max borrow.',
  },
  Liquidation: {
    term: 'Liquidation',
    short: 'If your loan gets too risky, anyone can repay part of it and take your collateral (with a bonus). Protects the pool.',
  },
  'Liquidation threshold': {
    term: 'Liquidation Threshold',
    short: 'The danger line. If your debt / collateral crosses this %, you can be liquidated. 80% here.',
  },
  'Close factor': {
    term: 'Close Factor',
    short: 'Max % of a bad loan one liquidator can repay at once. 50% here, so they can clear half per call.',
  },
  APR: {
    term: 'APR (Annual Percentage Rate)',
    short: 'Interest rate per year. 5% APR on $100 = $5 per year (linear, no compounding here).',
  },
  Supply: {
    term: 'Supply',
    short: 'Lend your tokens to the pool. You earn interest from borrowers.',
  },
  Borrow: {
    term: 'Borrow',
    short: 'Take tokens from the pool. You pay interest until you repay.',
  },
  ERC20: {
    term: 'ERC20',
    short: 'A standard recipe for tokens on Ethereum-style chains. Defines transfer, balance, approve.',
  },
  'Native OPN': {
    term: 'Native OPN',
    short: "The chain's main coin (like ETH on Ethereum). Not a token contract, it's the gas + base currency.",
  },
  mUSDC: {
    term: 'mUSDC (Mock USDC)',
    short: 'A fake stablecoin for testnet. Has no real value. Faucet gives you up to 10,000 per click.',
  },
  Decimals: {
    term: 'Decimals',
    short: 'How many digits after the dot. OPN uses 18, mUSDC uses 6. Matters for raw math.',
  },
  Faucet: {
    term: 'Faucet',
    short: 'A free dispenser for testnet tokens. Click → get tokens to test with.',
  },
  Swap: {
    term: 'Swap',
    short: 'Trade one token for another using the pool. Price set by reserve ratio.',
  },
  'Constant-product': {
    term: 'Constant-Product (x * y = k)',
    short: 'The AMM formula. Multiplying the two reserves stays constant. Big trades move price more.',
  },
  'Leveraged LP': {
    term: 'Leveraged LP',
    short: 'Deposit OPN as collateral, borrow against it, add the borrowed funds to a swap pool. Amplifies both gains and losses.',
  },
  Short: {
    term: 'Short',
    short: "Betting price goes down. Can't do here because lending only supports one asset. Multi-asset lending needed.",
  },
  Testnet: {
    term: 'Testnet',
    short: 'A practice network. Fake money, no real value. Used to test before mainnet.',
  },
  RPC: {
    term: 'RPC (Remote Procedure Call)',
    short: 'The URL your wallet/app talks to the blockchain through.',
  },
  ABI: {
    term: 'ABI (Application Binary Interface)',
    short: "A JSON description of a contract's functions so apps know how to call it.",
  },
  Gas: {
    term: 'Gas',
    short: 'The fee paid to run a transaction. Paid in the chain native coin (OPN here).',
  },
  Tx: {
    term: 'Tx (Transaction)',
    short: 'One signed action on the chain. Each has a hash you can look up on the explorer.',
  },
  'Health factor': {
    term: 'Health Factor',
    short: 'How safe your loan is. > 1 = safe, < 1 = liquidatable. Higher is healthier.',
  },
};

export function getGlossaryEntry(term: string): GlossaryEntry | null {
  return GLOSSARY[term] ?? null;
}
