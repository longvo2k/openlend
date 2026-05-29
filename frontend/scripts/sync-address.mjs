#!/usr/bin/env node
/* eslint-disable */
// Sync the LendingPool address from ../deployments/<network>.json into
// frontend/.env.local. Usage:
//   node scripts/sync-address.mjs hardhat        → writes _LOCAL
//   node scripts/sync-address.mjs iopnTestnet    → writes _TESTNET
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const network = process.argv[2];
if (!network) {
  console.error('Usage: node scripts/sync-address.mjs <hardhat|iopnTestnet>');
  process.exit(1);
}

const KEY =
  network === 'iopnTestnet'
    ? 'NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET'
    : network === 'hardhat'
    ? 'NEXT_PUBLIC_LENDING_POOL_ADDRESS_LOCAL'
    : null;
if (!KEY) {
  console.error(`Unknown network "${network}". Use "hardhat" or "iopnTestnet".`);
  process.exit(1);
}

const deploymentFile = path.join(here, '..', '..', 'deployments', `${network}.json`);
if (!fs.existsSync(deploymentFile)) {
  console.error(`Missing ${deploymentFile}. Deploy contracts first.`);
  process.exit(1);
}

const { lendingPool } = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
if (!lendingPool) {
  console.error(`No "lendingPool" field in ${deploymentFile}`);
  process.exit(1);
}

const envFile = path.join(here, '..', '.env.local');
let current = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const line = `${KEY}=${lendingPool}`;
const re = new RegExp(`^${KEY}=.*$`, 'm');
if (re.test(current)) {
  current = current.replace(re, line);
} else {
  current = current.trim() + (current.trim() ? '\n' : '') + line + '\n';
}
fs.writeFileSync(envFile, current);
console.log(`Wrote ${KEY}=${lendingPool} → ${envFile}`);
