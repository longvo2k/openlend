#!/usr/bin/env node
/* eslint-disable */
// Sync all three contract addresses (LendingPool, MockUSDC, OpenSwapPair)
// from `../deployments/<network>.json` into `frontend/.env.local`.
//
//   node scripts/sync-address.mjs hardhat        → writes _LOCAL keys
//   node scripts/sync-address.mjs iopnTestnet    → writes _TESTNET keys
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const network = process.argv[2];
if (!network) {
  console.error('Usage: node scripts/sync-address.mjs <hardhat|iopnTestnet>');
  process.exit(1);
}

const SUFFIX =
  network === 'iopnTestnet' ? 'TESTNET' :
  network === 'hardhat' ? 'LOCAL' :
  null;
if (!SUFFIX) {
  console.error(`Unknown network "${network}". Use "hardhat" or "iopnTestnet".`);
  process.exit(1);
}

const deploymentFile = path.join(here, '..', '..', 'deployments', `${network}.json`);
if (!fs.existsSync(deploymentFile)) {
  console.error(`Missing ${deploymentFile}. Deploy contracts first (\`npm run deploy:testnet\`).`);
  process.exit(1);
}

const d = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));

const envFile = path.join(here, '..', '.env.local');
let current = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

function setKey(key, value) {
  if (!value) return;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(current)) {
    current = current.replace(re, line);
  } else {
    current = current.trim() + (current.trim() ? '\n' : '') + line + '\n';
  }
}

setKey(`NEXT_PUBLIC_LENDING_POOL_ADDRESS_${SUFFIX}`, d.lendingPool);
setKey(`NEXT_PUBLIC_OPENSWAP_PAIR_${SUFFIX}`, d.openSwapPair);
setKey(`NEXT_PUBLIC_MOCK_USDC_${SUFFIX}`, d.mUSDC);
setKey(`NEXT_PUBLIC_PRICE_ORACLE_${SUFFIX}`, d.priceOracle);

fs.writeFileSync(envFile, current);
console.log(`Wrote ${SUFFIX} addresses → ${envFile}`);
if (d.lendingPool) console.log(`  NEXT_PUBLIC_LENDING_POOL_ADDRESS_${SUFFIX}=${d.lendingPool}`);
if (d.openSwapPair) console.log(`  NEXT_PUBLIC_OPENSWAP_PAIR_${SUFFIX}=${d.openSwapPair}`);
if (d.mUSDC) console.log(`  NEXT_PUBLIC_MOCK_USDC_${SUFFIX}=${d.mUSDC}`);
if (d.priceOracle) console.log(`  NEXT_PUBLIC_PRICE_ORACLE_${SUFFIX}=${d.priceOracle}`);
