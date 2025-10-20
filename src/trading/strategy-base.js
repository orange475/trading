class BaseStrategy {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.enabled = config.enabled !== false;
    this.watchlist = config.watchlist || [];
    this.engine = null;
    this.description = config.description || '';
    this.lastSignals = [];
    this.performance = {
      totalTrades: 0,
      winningTrades: 0,
      totalPnl: 0
    };
  }

  setEngine(engine) {
    this.engine = engine;
  }

  async evaluate(marketData) {
    throw new Error('evaluate() must be implemented by strategy subclass');
  }

  enable() {
    this.enabled = true;
    if (this.engine) {
      this.engine.emit('strategy_enabled', { name: this.name });
    }
  }

  disable() {
    this.enabled = false;
    if (this.engine) {
      this.engine.emit('strategy_disabled', { name: this.name });
    }
  }

  addToWatchlist(symbol) {
    if (!this.watchlist.includes(symbol)) {
      this.watchlist.push(symbol);
    }
  }

  removeFromWatchlist(symbol) {
    const index = this.watchlist.indexOf(symbol);
    if (index > -1) {
      this.watchlist.splice(index, 1);
    }
  }

  createSignal(symbol, action, quantity, options = {}) {
    const signal = {
      symbol,
      action, // 'buy' or 'sell'
      quantity,
      orderType: options.orderType || 'market',
      limitPrice: options.limitPrice,
      stopPrice: options.stopPrice,
      timeInForce: options.timeInForce || 'gtc',
      strategyName: this.name,
      timestamp: new Date(),
      ...options
    };

    this.lastSignals.push(signal);
    
    // Keep only last 100 signals
    if (this.lastSignals.length > 100) {
      this.lastSignals = this.lastSignals.slice(-100);
    }

    return signal;
  }

  getPerformance() {
    return {
      ...this.performance,
      winRate: this.performance.totalTrades > 0 
        ? this.performance.winningTrades / this.performance.totalTrades 
        : 0
    };
  }

  updatePerformance(trade) {
    this.performance.totalTrades++;
    this.performance.totalPnl += trade.pnl || 0;
    
    if (trade.pnl > 0) {
      this.performance.winningTrades++;
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`);
  }

  // Helper methods for common calculations
  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  calculateEMA(prices, period, previousEMA = null) {
    if (prices.length === 0) return null;
    
    const currentPrice = prices[prices.length - 1];
    const multiplier = 2 / (period + 1);
    
    if (previousEMA === null) {
      // First EMA calculation, use SMA
      return this.calculateSMA(prices.slice(-period), period);
    }
    
    return (currentPrice * multiplier) + (previousEMA * (1 - multiplier));
  }

  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const recentChanges = changes.slice(-period);
    const gains = recentChanges.filter(change => change > 0);
    const losses = recentChanges.filter(change => change < 0).map(loss => Math.abs(loss));
    
    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(prices, period);
    if (!sma) return null;
    
    const recentPrices = prices.slice(-period);
    const variance = recentPrices.reduce((sum, price) => {
      return sum + Math.pow(price - sma, 2);
    }, 0) / period;
    
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }
}

export default BaseStrategy;