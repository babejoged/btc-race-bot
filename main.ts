/**
 * BTC race bot v1: momentum + RSI hybrid
 * Reads price bars from stdin, outputs trading orders
 * 
 * Strategy:
 * 1. Compute RSI(14) and SMA(20)
 * 2. Buy when: RSI > 30 AND price > SMA (momentum)
 * 3. Sell when: RSI < 70 AND price < SMA (mean reversion)
 * 4. Always keep max pos 100%, min trade 0.001 BTC
 * 
 * Deterministic, standard library only.
 */

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Order {
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}

// Strategy parameters
const RSI_PERIOD = 14;
const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;
const SMA_PERIOD = 20;
const MAX_POSITION = 0.95; // 95% max position
const MIN_TRADE_SIZE = 0.001; // Minimum BTC trade
const FEE_BPS = 4; // 4 bps fee
const SLIPPAGE_BPS = 2; // 2 bps slippage

// State
interface State {
  usd: number;
  btc: number;
  position: number;
  prices: number[];
  rsiValues: number[];
  gains: number[]; // Running gains for SMA
}

const state: State = {
  usd: 1000,
  btc: 0,
  position: 0,
  prices: [],
  rsiValues: [],
  gains: []
};

function computeRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const gains = [];
  const losses = [];
  for (const change of changes) {
    if (change >= 0) {
      gains.push(change);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(-change);
    }
  }
  
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function outputOrder(type: 'BUY' | 'SELL', quantity: number, price: number) {
  const order = {
    type,
    quantity,
    price: Math.round(price * 10000) / 10000,
    timestamp: Date.now()
  };
  process.stdout.write(JSON.stringify(order) + '\n');
}

process.stdin.on('data', (chunk: Buffer) => {
  const lines = chunk.toString().split('\n');
  for (const line of lines) {
    const line = line.trim();
    if (!line) continue;
    
    try {
      const bar = JSON.parse(line) as Bar;
      processBar(bar);
    } catch (e) {
      // Ignore malformed lines
    }
  }
});

function processBar(bar: Bar) {
  const price = bar.close;
  const timestamp = bar.timestamp;
  
  // Record price history
  state.prices.push(price);
  if (state.prices.length > 200) {
    state.prices.shift();
  }
  
  // Compute indicators
  const sma = computeSMA(state.prices, SMA_PERIOD);
  const rsi = computeRSI(state.prices, RSI_PERIOD);
  
  if (sma === null || rsi === null) {
    return;
  }
  
  // Get current position value
  const positionValue = state.btc * price;
  
  // Determine action
  const inUptrend = price > sma;
  const rsiCondition = rsi > 30 && rsi < 70;
  
  if (inUptrend && rsiCondition && state.btc === 0) {
    // ENTER LONG
    const btcToBuy = state.usd * MAX_POSITION / price;
    if (btcToBuy >= MIN_TRADE_SIZE) {
      state.position = btcToBuy;
      state.usd = 0;
      state.btc = btcToBuy;
      outputOrder('BUY', btcToBuy, price);
    }
  } else if (!inUptrend && rsiCondition && state.btc > 0) {
    // EXIT LONG
    const btcToSell = state.btc;
    state.position = 0;
    state.usd += btcToSell * price;
    state.btc = 0;
    outputOrder('SELL', btcToSell, price);
  } else if (inUptrend && state.btc > 0 && price > sma * 1.01) {
    // HOLD LONG (momentum continuation)
    // No action needed, just let the position ride
  } else if (!inUptrend && state.btc > 0 && price < sma * 0.99) {
    // EXIT at loss
    const btcToSell = state.btc;
    state.position = 0;
    state.usd += btcToSell * price;
    state.btc = 0;
    outputOrder('SELL', btcToSell, price);
  }
}
