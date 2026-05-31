# Stratus Roadmap

What we're building next.

## Next · Q4 2026

- **Price oracle** integration (Pyth if available on IOPN testnet, otherwise a clearly labelled timelocked admin-price fallback). Unlocks cross-asset HF math, which gates multi-asset lending.
- **Permit2** for one-tx mUSDC flows on Swap, Add Liquidity, and the Leveraged LP composer. Blocked today: Permit2 is not deployed at its canonical address on IOPN testnet, and MockUSDC is a plain ERC20 with no `permit()`. Lands once one of those gaps closes.
- **Leverage-long looper** on OPN once a yield-bearing collateral or multi-asset lending makes the deposit-borrow loop economically meaningful. On single-asset lending the loop only amplifies gross exposure at a 5 percent APR cost with no offsetting yield.

*Solo and part-time, so oracle-dependent items ship behind the admin-price fallback if Pyth is not live by Q4.*

## Later · 2027 and beyond

Multi-asset lending (unlocks true shorts). Multi-pair Swap with factory and router. Kinked interest rate curve. Reserve factor and treasury sink. External security review. Governance with timelock. Flash loans. Cross-chain via IBC.

---

Tracked publicly via GitHub Issues.
