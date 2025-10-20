import EventEmitter from 'events';

class TradingEngine extends EventEmitter {
  constructor(brokers, config) {
    super();
    this.brokers = brokers;
    this.config = config;
    this.strategies = new Map();
    this.positions = new Map();
    this.orders = new Map();
    this.running = false;
    this.riskManager = null;
  }

  setRiskManager(riskManager) {
    this.riskManager = riskManager;
  }

  addStrategy(name, strategy) {
    this.strategies.set(name, strategy);
    strategy.setEngine(this);
    this.emit('strategy_added', { name, strategy });
  }

  removeStrategy(name) {
    if (this.strategies.has(name)) {
      this.strategies.delete(name);
      this.emit('strategy_removed', { name });
    }
  }

  async start() {
    if (this.running) {
      throw new Error('Trading engine is already running');
    }

    console.log('Starting trading engine...');
    this.running = true;

    // Initialize brokers
    for (const [name, broker] of Object.entries(this.brokers)) {
      try {
        await broker.authenticate();
        console.log(`✓ ${name} broker connected`);
      } catch (error) {
        console.error(`✗ Failed to connect ${name} broker:`, error.message);
        throw error;
      }
    }

    // Start strategy execution loop
    this.executionLoop();
    this.emit('started');
    console.log('Trading engine started');
  }

  async stop() {
    if (!this.running) return;

    console.log('Stopping trading engine...');
    this.running = false;
    
    // Cancel all pending orders
    await this.cancelAllOrders();
    
    this.emit('stopped');
    console.log('Trading engine stopped');
  }

  async executionLoop() {
    while (this.running) {
      try {
        await this.updatePositions();
        await this.executeStrategies();
        await this.processOrders();
        
        // Wait before next cycle
        await new Promise(resolve => setTimeout(resolve, this.config.executionIntervalMs || 1000));
      } catch (error) {
        console.error('Error in execution loop:', error);
        this.emit('error', error);
      }
    }
  }

  async updatePositions() {
    for (const [brokerName, broker] of Object.entries(this.brokers)) {
      try {
        const positions = await broker.getPositions();
        this.positions.set(brokerName, positions);
      } catch (error) {
        console.error(`Error updating positions for ${brokerName}:`, error.message);
      }
    }
  }

  async executeStrategies() {
    const marketData = await this.gatherMarketData();
    
    for (const [name, strategy] of this.strategies) {
      try {
        if (strategy.enabled) {
          const signals = await strategy.evaluate(marketData);
          await this.processSignals(signals, name);
        }
      } catch (error) {
        console.error(`Error executing strategy ${name}:`, error.message);
        this.emit('strategy_error', { name, error });
      }
    }
  }

  async gatherMarketData() {
    const data = {};
    const symbols = this.getAllWatchedSymbols();

    for (const symbol of symbols) {
      try {
        // Use first available broker for market data
        const broker = Object.values(this.brokers)[0];
        data[symbol] = await broker.getMarketData(symbol);
      } catch (error) {
        console.error(`Error getting market data for ${symbol}:`, error.message);
      }
    }

    return data;
  }

  getAllWatchedSymbols() {
    const symbols = new Set();
    
    for (const strategy of this.strategies.values()) {
      if (strategy.watchlist) {
        strategy.watchlist.forEach(symbol => symbols.add(symbol));
      }
    }
    
    return Array.from(symbols);
  }

  async processSignals(signals, strategyName) {
    for (const signal of signals) {
      try {
        const validatedSignal = await this.validateSignal(signal, strategyName);
        if (validatedSignal) {
          await this.executeSignal(validatedSignal, strategyName);
        }
      } catch (error) {
        console.error(`Error processing signal from ${strategyName}:`, error.message);
      }
    }
  }

  async validateSignal(signal, strategyName) {
    // Basic signal validation
    if (!signal.symbol || !signal.action || !signal.quantity) {
      console.warn(`Invalid signal from ${strategyName}:`, signal);
      return null;
    }

    // Risk management validation
    if (this.riskManager) {
      const approved = await this.riskManager.validateOrder({
        symbol: signal.symbol,
        qty: signal.quantity,
        side: signal.action,
        type: signal.orderType || 'market'
      }, this.positions);

      if (!approved) {
        console.warn(`Signal rejected by risk manager:`, signal);
        return null;
      }
    }

    return signal;
  }

  async executeSignal(signal, strategyName) {
    const broker = this.selectBroker(signal);
    
    const order = {
      symbol: signal.symbol,
      qty: signal.quantity,
      side: signal.action,
      type: signal.orderType || 'market',
      limitPrice: signal.limitPrice,
      stopPrice: signal.stopPrice,
      timeInForce: signal.timeInForce || 'gtc'
    };

    try {
      const result = await broker.placeOrder(order);
      
      this.orders.set(result.orderId, {
        ...result,
        strategyName,
        signal
      });

      this.emit('order_placed', {
        orderId: result.orderId,
        order: result,
        strategyName,
        signal
      });

      console.log(`Order placed: ${result.orderId} - ${signal.action} ${signal.quantity} ${signal.symbol}`);
    } catch (error) {
      console.error(`Failed to execute signal:`, error.message);
      this.emit('order_failed', { signal, error, strategyName });
    }
  }

  selectBroker(signal) {
    // Simple broker selection logic - can be enhanced
    if (signal.preferredBroker && this.brokers[signal.preferredBroker]) {
      return this.brokers[signal.preferredBroker];
    }
    
    // Return first available broker
    return Object.values(this.brokers)[0];
  }

  async processOrders() {
    for (const [orderId, orderInfo] of this.orders) {
      try {
        // Check order status and update if needed
        const broker = this.selectBroker(orderInfo.signal);
        const orderHistory = await broker.getOrderHistory();
        const currentOrder = orderHistory.find(o => o.orderId === orderId);
        
        if (currentOrder && currentOrder.status !== orderInfo.status) {
          this.orders.set(orderId, { ...orderInfo, ...currentOrder });
          this.emit('order_updated', { orderId, order: currentOrder });
        }
      } catch (error) {
        console.error(`Error processing order ${orderId}:`, error.message);
      }
    }
  }

  async cancelAllOrders() {
    const promises = [];
    
    for (const [orderId, orderInfo] of this.orders) {
      if (orderInfo.status === 'new' || orderInfo.status === 'partially_filled') {
        const broker = this.selectBroker(orderInfo.signal);
        promises.push(broker.cancelOrder(orderId).catch(err => 
          console.error(`Failed to cancel order ${orderId}:`, err.message)
        ));
      }
    }
    
    await Promise.all(promises);
  }

  getPositions(brokerName = null) {
    if (brokerName) {
      return this.positions.get(brokerName) || [];
    }
    
    const allPositions = [];
    for (const positions of this.positions.values()) {
      allPositions.push(...positions);
    }
    return allPositions;
  }

  getOrders() {
    return Array.from(this.orders.values());
  }

  getStrategies() {
    return Array.from(this.strategies.entries()).map(([name, strategy]) => ({
      name,
      enabled: strategy.enabled,
      description: strategy.description
    }));
  }
}

export default TradingEngine;