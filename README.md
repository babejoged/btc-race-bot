# BTC Race Bot

Simple momentum + RSI trading bot for make.fun's BTC Race 24h competition.

## Strategy
- Reads price bars from stdin
- Uses RSI(14) + SMA(20) crossover
- BUY when RSI > 30 and price > SMA
- SELL when RSI < 70 and price < SMA
- Starts with $1,000
- Max position 95%, min trade 0.001 BTC
- 4 bps fee, 2 bps slippage

## Run
```bash
cat price_data.jsonl | node main.ts > orders.jsonl
```

## License
MIT
