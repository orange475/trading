import Alpaca from '@alpacahq/alpaca-trade-api';
import BaseBroker from './base-broker.js';

class AlpacaBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.alpaca = new Alpaca({
      keyId: config.apiKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl || 'https://paper-api.alpaca.markets',
      usePolygon: false
    });
  }

  async authenticate() {
    try {
      await this.alpaca.getAccount();
      this.authenticated = true;
      return true;
    } catch (error) {
      throw new Error(`Alpaca authentication failed: ${error.message}`);
    }
  }

  async getAccountInfo() {
    try {
      const account = await this.alpaca.getAccount();
      return {
        broker: 'alpaca',
        accountId: account.id,
        buyingPower: parseFloat(account.buying_power),
        portfolioValue: parseFloat(account.portfolio_value),
        cash: parseFloat(account.cash),
        dayTradeCount: account.day_trade_count,
        status: account.status
      };
    } catch (error) {
      throw new Error(`Failed to get Alpaca account info: ${error.message}`);
    }
  }

  async getPositions() {
    try {
      const positions = await this.alpaca.getPositions();
      return positions.map(pos => ({
        symbol: pos.symbol,
        qty: parseInt(pos.qty),
        side: parseInt(pos.qty) > 0 ? 'long' : 'short',
        marketValue: parseFloat(pos.market_value),
        avgCost: parseFloat(pos.avg_cost_basis),
        unrealizedPnl: parseFloat(pos.unrealized_pl)
      }));
    } catch (error) {
      throw new Error(`Failed to get Alpaca positions: ${error.message}`);
    }
  }

  async placeOrder(order) {
    this.validateOrder(order);
    
    try {
      const alpacaOrder = {
        symbol: order.symbol,
        qty: order.qty,
        side: order.side,
        type: order.type,
        time_in_force: order.timeInForce || 'gtc'
      };

      if (order.type === 'limit') {
        alpacaOrder.limit_price = order.limitPrice;
      }
      if (order.type === 'stop') {
        alpacaOrder.stop_price = order.stopPrice;
      }

      const result = await this.alpaca.createOrder(alpacaOrder);
      return {
        orderId: result.id,
        symbol: result.symbol,
        qty: parseInt(result.qty),
        side: result.side,
        type: result.order_type,
        status: result.status,
        timestamp: new Date(result.created_at)
      };
    } catch (error) {
      throw new Error(`Failed to place Alpaca order: ${error.message}`);
    }
  }

  async cancelOrder(orderId) {
    try {
      await this.alpaca.cancelOrder(orderId);
      return true;
    } catch (error) {
      throw new Error(`Failed to cancel Alpaca order: ${error.message}`);
    }
  }

  async getMarketData(symbol) {
    try {
      const quote = await this.alpaca.getLatestTrade(symbol);
      const bars = await this.alpaca.getBarsV2(symbol, {
        timeframe: '1Day',
        limit: 1
      });
      
      const latestBar = bars[0];
      
      return {
        symbol,
        price: quote.price,
        volume: quote.size,
        timestamp: new Date(quote.timestamp),
        open: latestBar?.open,
        high: latestBar?.high,
        low: latestBar?.low,
        close: latestBar?.close
      };
    } catch (error) {
      throw new Error(`Failed to get Alpaca market data: ${error.message}`);
    }
  }

  async getOrderHistory(symbol = null, limit = 50) {
    try {
      const params = {
        status: 'all',
        limit,
        direction: 'desc'
      };
      
      if (symbol) params.symbols = symbol;
      
      const orders = await this.alpaca.getOrders(params);
      return orders.map(order => ({
        orderId: order.id,
        symbol: order.symbol,
        qty: parseInt(order.qty),
        side: order.side,
        type: order.order_type,
        status: order.status,
        filledQty: parseInt(order.filled_qty || 0),
        avgFillPrice: parseFloat(order.filled_avg_price || 0),
        timestamp: new Date(order.created_at)
      }));
    } catch (error) {
      throw new Error(`Failed to get Alpaca order history: ${error.message}`);
    }
  }
}

export default AlpacaBroker;