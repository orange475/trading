import BaseStrategy from '../strategy-base.js';

class NewsBasedStrategy extends BaseStrategy {
  constructor(config = {}) {
    super('NewsBasedStrategy', {
      description: 'Trades based on news sentiment and buzz analysis',
      sentimentThreshold: 0.6,
      buzzThreshold: 50,
      positionSize: 100,
      holdingPeriod: 3600000, // 1 hour in milliseconds
      maxPositionsPerSymbol: 1,
      ...config
    });

    this.activePositions = new Map();
    this.dataAggregator = null;
  }

  setDataAggregator(aggregator) {
    this.dataAggregator = aggregator;
  }

  async evaluate(marketData) {
    if (!this.dataAggregator) {
      this.log('No data aggregator set, skipping evaluation', 'warn');
      return [];
    }

    const signals = [];
    const latestData = this.dataAggregator.getLatestData();
    
    if (!latestData || !latestData.summary) {
      this.log('No data available for evaluation', 'debug');
      return signals;
    }

    // Evaluate each symbol in our watchlist
    for (const symbol of this.watchlist) {
      try {
        const symbolAnalysis = latestData.summary[symbol];
        if (!symbolAnalysis) continue;

        const currentPrice = marketData[symbol]?.price;
        if (!currentPrice) continue;

        // Check for buy signals
        const buySignal = this.evaluateBuySignal(symbol, symbolAnalysis, currentPrice);
        if (buySignal) {
          signals.push(buySignal);
        }

        // Check for sell signals on existing positions
        const sellSignal = this.evaluateSellSignal(symbol, symbolAnalysis, currentPrice);
        if (sellSignal) {
          signals.push(sellSignal);
        }

      } catch (error) {
        this.log(`Error evaluating ${symbol}: ${error.message}`, 'error');
      }
    }

    return signals;
  }

  evaluateBuySignal(symbol, analysis, currentPrice) {
    // Don't buy if we already have a position
    if (this.activePositions.has(symbol)) {
      return null;
    }

    // Check if sentiment and buzz meet our thresholds
    const strongPositiveSentiment = analysis.sentimentScore >= this.config.sentimentThreshold;
    const highBuzz = analysis.buzzScore >= this.config.buzzThreshold;
    const hasNewsContent = analysis.newsMentions > 0;

    if (strongPositiveSentiment && highBuzz && hasNewsContent) {
      this.log(`Buy signal for ${symbol}: sentiment=${analysis.sentimentScore}, buzz=${analysis.buzzScore}`, 'info');
      
      // Track this position
      this.activePositions.set(symbol, {
        entryTime: new Date(),
        entryPrice: currentPrice,
        reason: 'positive_sentiment_buzz'
      });

      return this.createSignal(symbol, 'buy', this.config.positionSize, {
        orderType: 'market',
        reason: `Positive sentiment (${analysis.sentimentScore.toFixed(2)}) with high buzz (${analysis.buzzScore})`
      });
    }

    return null;
  }

  evaluateSellSignal(symbol, analysis, currentPrice) {
    const position = this.activePositions.get(symbol);
    if (!position) {
      return null;
    }

    const holdingTime = Date.now() - position.entryTime.getTime();
    const priceChange = (currentPrice - position.entryPrice) / position.entryPrice;

    // Sell conditions
    const holdingPeriodExceeded = holdingTime >= this.config.holdingPeriod;
    const strongNegativeSentiment = analysis.sentimentScore <= -this.config.sentimentThreshold;
    const stopLoss = priceChange <= -0.05; // 5% stop loss
    const takeProfit = priceChange >= 0.10; // 10% take profit

    if (holdingPeriodExceeded || strongNegativeSentiment || stopLoss || takeProfit) {
      let reason = 'unknown';
      if (holdingPeriodExceeded) reason = 'holding_period_exceeded';
      else if (strongNegativeSentiment) reason = 'negative_sentiment';
      else if (stopLoss) reason = 'stop_loss';
      else if (takeProfit) reason = 'take_profit';

      this.log(`Sell signal for ${symbol}: reason=${reason}, P&L=${(priceChange * 100).toFixed(2)}%`, 'info');
      
      // Remove from active positions
      this.activePositions.delete(symbol);

      return this.createSignal(symbol, 'sell', this.config.positionSize, {
        orderType: 'market',
        reason: `${reason} - P&L: ${(priceChange * 100).toFixed(2)}%`
      });
    }

    return null;
  }

  // Override to provide strategy-specific performance metrics
  getPerformance() {
    const basePerformance = super.getPerformance();
    
    return {
      ...basePerformance,
      activePositions: this.activePositions.size,
      positionsDetails: Array.from(this.activePositions.entries()).map(([symbol, position]) => ({
        symbol,
        entryTime: position.entryTime,
        entryPrice: position.entryPrice,
        holdingTime: Date.now() - position.entryTime.getTime()
      }))
    };
  }

  // Strategy configuration methods
  setSentimentThreshold(threshold) {
    this.config.sentimentThreshold = threshold;
    this.log(`Sentiment threshold updated to ${threshold}`, 'info');
  }

  setBuzzThreshold(threshold) {
    this.config.buzzThreshold = threshold;
    this.log(`Buzz threshold updated to ${threshold}`, 'info');
  }

  setPositionSize(size) {
    this.config.positionSize = size;
    this.log(`Position size updated to ${size}`, 'info');
  }

  setHoldingPeriod(periodMs) {
    this.config.holdingPeriod = periodMs;
    this.log(`Holding period updated to ${periodMs}ms`, 'info');
  }

  // Get strategy-specific insights
  getInsights() {
    const insights = {
      strategyType: 'news_sentiment',
      configuration: {
        sentimentThreshold: this.config.sentimentThreshold,
        buzzThreshold: this.config.buzzThreshold,
        positionSize: this.config.positionSize,
        holdingPeriod: this.config.holdingPeriod
      },
      activePositions: this.activePositions.size,
      recentSignals: this.lastSignals.slice(-10).map(signal => ({
        symbol: signal.symbol,
        action: signal.action,
        timestamp: signal.timestamp,
        reason: signal.reason
      }))
    };

    return insights;
  }

  // Reset strategy state (useful for backtesting or restarts)
  reset() {
    this.activePositions.clear();
    this.lastSignals = [];
    this.performance = {
      totalTrades: 0,
      winningTrades: 0,
      totalPnl: 0
    };
    this.log('Strategy state reset', 'info');
  }

  // Validation method
  validate() {
    const errors = [];

    if (this.config.sentimentThreshold < 0 || this.config.sentimentThreshold > 1) {
      errors.push('Sentiment threshold must be between 0 and 1');
    }

    if (this.config.buzzThreshold < 0) {
      errors.push('Buzz threshold must be positive');
    }

    if (this.config.positionSize <= 0) {
      errors.push('Position size must be positive');
    }

    if (this.watchlist.length === 0) {
      errors.push('Watchlist cannot be empty');
    }

    return errors;
  }
}

export default NewsBasedStrategy;