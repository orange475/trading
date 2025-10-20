class RiskManager {
  constructor(config) {
    this.config = {
      maxPositionSize: config.maxPositionSize || 1000,
      maxDailyLoss: config.maxDailyLoss || 500,
      maxPortfolioRisk: config.maxPortfolioRisk || 0.02, // 2%
      stopLossPercentage: config.stopLossPercentage || 0.02, // 2%
      maxOpenPositions: config.maxOpenPositions || 10,
      blacklistedSymbols: config.blacklistedSymbols || [],
      ...config
    };
    
    this.dailyPnl = 0;
    this.dailyTrades = 0;
    this.lastResetDate = new Date().toDateString();
  }

  async validateOrder(order, positions) {
    this.resetDailyCountersIfNeeded();

    // Check if symbol is blacklisted
    if (this.config.blacklistedSymbols.includes(order.symbol)) {
      this.log(`Order rejected: ${order.symbol} is blacklisted`, 'warn');
      return false;
    }

    // Check daily loss limit
    if (this.dailyPnl <= -this.config.maxDailyLoss) {
      this.log(`Order rejected: Daily loss limit reached (${this.dailyPnl})`, 'warn');
      return false;
    }

    // Check maximum position size
    if (order.qty * (order.limitPrice || 100) > this.config.maxPositionSize) {
      this.log(`Order rejected: Position size too large (${order.qty})`, 'warn');
      return false;
    }

    // Check maximum open positions
    const allPositions = this.flattenPositions(positions);
    if (allPositions.length >= this.config.maxOpenPositions && order.side === 'buy') {
      this.log(`Order rejected: Too many open positions (${allPositions.length})`, 'warn');
      return false;
    }

    // Check portfolio risk
    if (!this.validatePortfolioRisk(order, allPositions)) {
      return false;
    }

    // Check position concentration
    if (!this.validatePositionConcentration(order, allPositions)) {
      return false;
    }

    return true;
  }

  validatePortfolioRisk(order, positions) {
    const totalPortfolioValue = positions.reduce((sum, pos) => 
      sum + Math.abs(pos.marketValue || 0), 0);
    
    if (totalPortfolioValue === 0) return true;

    const orderValue = order.qty * (order.limitPrice || 100);
    const riskPercentage = orderValue / totalPortfolioValue;

    if (riskPercentage > this.config.maxPortfolioRisk) {
      this.log(`Order rejected: Portfolio risk too high (${riskPercentage.toFixed(2)}%)`, 'warn');
      return false;
    }

    return true;
  }

  validatePositionConcentration(order, positions) {
    const symbolPositions = positions.filter(pos => pos.symbol === order.symbol);
    const totalSymbolValue = symbolPositions.reduce((sum, pos) => 
      sum + Math.abs(pos.marketValue || 0), 0);

    const orderValue = order.qty * (order.limitPrice || 100);
    const maxSymbolValue = this.config.maxPositionSize;

    if (totalSymbolValue + orderValue > maxSymbolValue) {
      this.log(`Order rejected: Symbol concentration too high for ${order.symbol}`, 'warn');
      return false;
    }

    return true;
  }

  calculateStopLoss(order, currentPrice) {
    if (order.side === 'buy') {
      return currentPrice * (1 - this.config.stopLossPercentage);
    } else {
      return currentPrice * (1 + this.config.stopLossPercentage);
    }
  }

  updateDailyPnl(pnl) {
    this.resetDailyCountersIfNeeded();
    this.dailyPnl += pnl;
    this.dailyTrades++;
  }

  resetDailyCountersIfNeeded() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyPnl = 0;
      this.dailyTrades = 0;
      this.lastResetDate = today;
      this.log('Daily counters reset', 'info');
    }
  }

  flattenPositions(positionsMap) {
    const allPositions = [];
    
    if (positionsMap instanceof Map) {
      for (const positions of positionsMap.values()) {
        allPositions.push(...positions);
      }
    } else if (Array.isArray(positionsMap)) {
      allPositions.push(...positionsMap);
    } else {
      for (const positions of Object.values(positionsMap)) {
        if (Array.isArray(positions)) {
          allPositions.push(...positions);
        }
      }
    }
    
    return allPositions;
  }

  getDailyStats() {
    return {
      dailyPnl: this.dailyPnl,
      dailyTrades: this.dailyTrades,
      remainingLossCapacity: this.config.maxDailyLoss + this.dailyPnl,
      date: this.lastResetDate
    };
  }

  getRiskLimits() {
    return {
      maxPositionSize: this.config.maxPositionSize,
      maxDailyLoss: this.config.maxDailyLoss,
      maxPortfolioRisk: this.config.maxPortfolioRisk,
      stopLossPercentage: this.config.stopLossPercentage,
      maxOpenPositions: this.config.maxOpenPositions,
      blacklistedSymbols: this.config.blacklistedSymbols
    };
  }

  updateRiskLimits(newLimits) {
    this.config = { ...this.config, ...newLimits };
    this.log('Risk limits updated', 'info');
  }

  addToBlacklist(symbol) {
    if (!this.config.blacklistedSymbols.includes(symbol)) {
      this.config.blacklistedSymbols.push(symbol);
      this.log(`${symbol} added to blacklist`, 'info');
    }
  }

  removeFromBlacklist(symbol) {
    const index = this.config.blacklistedSymbols.indexOf(symbol);
    if (index > -1) {
      this.config.blacklistedSymbols.splice(index, 1);
      this.log(`${symbol} removed from blacklist`, 'info');
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [RiskManager] [${level.toUpperCase()}] ${message}`);
  }
}

export default RiskManager;