class BaseBroker {
  constructor(config) {
    this.config = config;
    this.authenticated = false;
  }

  async authenticate() {
    throw new Error('authenticate() must be implemented by subclass');
  }

  async getAccountInfo() {
    throw new Error('getAccountInfo() must be implemented by subclass');
  }

  async getPositions() {
    throw new Error('getPositions() must be implemented by subclass');
  }

  async placeOrder(order) {
    throw new Error('placeOrder() must be implemented by subclass');
  }

  async cancelOrder(orderId) {
    throw new Error('cancelOrder() must be implemented by subclass');
  }

  async getMarketData(symbol) {
    throw new Error('getMarketData() must be implemented by subclass');
  }

  async getOrderHistory(symbol = null, limit = 50) {
    throw new Error('getOrderHistory() must be implemented by subclass');
  }

  validateOrder(order) {
    const required = ['symbol', 'qty', 'side', 'type'];
    for (const field of required) {
      if (!order[field]) {
        throw new Error(`Order missing required field: ${field}`);
      }
    }

    if (!['buy', 'sell'].includes(order.side)) {
      throw new Error('Order side must be "buy" or "sell"');
    }

    if (!['market', 'limit', 'stop'].includes(order.type)) {
      throw new Error('Order type must be "market", "limit", or "stop"');
    }

    if (order.qty <= 0) {
      throw new Error('Order quantity must be positive');
    }

    return true;
  }
}

export default BaseBroker;