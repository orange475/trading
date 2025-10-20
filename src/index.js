#!/usr/bin/env node

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Import components
import ConfigManager from './config/config-manager.js';
import BrokerFactory from './brokers/broker-factory.js';
import TradingEngine from './trading/trading-engine.js';
import RiskManager from './trading/risk-manager.js';
import DataAggregator from './data-collection/data-aggregator.js';
import NotificationManager from './notifications/notification-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TradingApplication {
  constructor() {
    this.configManager = new ConfigManager();
    this.brokers = {};
    this.tradingEngine = null;
    this.riskManager = null;
    this.dataAggregator = null;
    this.notificationManager = null;
    this.running = false;

    // Bind event handlers
    this.handleShutdown = this.handleShutdown.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  async initialize() {
    console.log('🚀 Initializing Trading Application...');

    try {
      // Validate configuration
      const configErrors = this.configManager.validate();
      if (configErrors.length > 0) {
        console.error('Configuration errors:');
        configErrors.forEach(error => console.error(`  - ${error}`));
        throw new Error('Invalid configuration');
      }

      // Initialize notification manager
      const notificationConfig = this.configManager.getNotificationConfig();
      this.notificationManager = new NotificationManager(notificationConfig);
      console.log('✓ Notification manager initialized');

      // Initialize brokers
      await this.initializeBrokers();

      // Initialize risk manager
      const riskConfig = this.configManager.getRiskLimits();
      this.riskManager = new RiskManager(riskConfig);
      console.log('✓ Risk manager initialized');

      // Initialize trading engine
      const tradingConfig = this.configManager.get('trading');
      this.tradingEngine = new TradingEngine(this.brokers, tradingConfig);
      this.tradingEngine.setRiskManager(this.riskManager);
      console.log('✓ Trading engine initialized');

      // Initialize data aggregator
      const dataConfig = this.configManager.get('dataCollection');
      if (dataConfig.enabled) {
        this.dataAggregator = new DataAggregator(dataConfig);
        console.log('✓ Data aggregator initialized');
      }

      // Set up event listeners
      this.setupEventListeners();

      console.log('✅ Application initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      throw error;
    }
  }

  async initializeBrokers() {
    const enabledBrokers = this.configManager.getEnabledBrokers();
    
    if (enabledBrokers.length === 0) {
      throw new Error('No brokers are enabled. Please enable at least one broker in the configuration.');
    }

    for (const { name, config } of enabledBrokers) {
      try {
        const broker = BrokerFactory.createBroker(name, config);
        await broker.authenticate();
        this.brokers[name] = broker;
        console.log(`✓ ${name} broker connected`);
      } catch (error) {
        console.error(`❌ Failed to connect ${name} broker:`, error.message);
        throw error;
      }
    }
  }

  setupEventListeners() {
    // Trading engine events
    this.tradingEngine.on('order_placed', async (event) => {
      console.log(`📋 Order placed: ${event.order.orderId}`);
      await this.notificationManager.notifyOrderPlaced(event.order);
    });

    this.tradingEngine.on('order_updated', async (event) => {
      if (event.order.status === 'filled') {
        console.log(`✅ Order filled: ${event.order.orderId}`);
        await this.notificationManager.notifyOrderFilled(event.order);
      }
    });

    this.tradingEngine.on('error', async (error) => {
      console.error('Trading engine error:', error);
      await this.notificationManager.notifySystemEvent({
        type: 'trading_error',
        message: `Trading engine error: ${error.message}`,
        priority: 'high'
      });
    });

    // Data aggregator events
    if (this.dataAggregator) {
      this.dataAggregator.on('significant_events', async (events) => {
        for (const event of events) {
          console.log(`🚨 Significant event: ${event.description}`);
          await this.notificationManager.notifySignificantEvent(event);
        }
      });

      this.dataAggregator.on('collection_error', async (error) => {
        console.error('Data collection error:', error);
        await this.notificationManager.notifySystemEvent({
          type: 'data_collection_error',
          message: `Data collection error: ${error.message}`,
          priority: 'medium'
        });
      });
    }

    // Process exit handlers
    process.on('SIGINT', this.handleShutdown);
    process.on('SIGTERM', this.handleShutdown);
    process.on('uncaughtException', this.handleError);
    process.on('unhandledRejection', this.handleError);

    // Config change handler
    this.configManager.watch((event, data) => {
      console.log(`⚙️ Configuration ${event}:`, data);
    });
  }

  async start() {
    if (this.running) {
      console.warn('Application is already running');
      return;
    }

    console.log('▶️  Starting trading application...');

    try {
      // Start data collection
      if (this.dataAggregator) {
        this.dataAggregator.start();
        console.log('✓ Data collection started');
      }

      // Start trading engine
      if (this.configManager.get('trading.enabled')) {
        await this.tradingEngine.start();
        console.log('✓ Trading engine started');
      } else {
        console.log('ℹ️  Trading engine disabled in configuration');
      }

      this.running = true;

      await this.notificationManager.notifySystemEvent({
        type: 'application_started',
        message: 'Trading application started successfully',
        priority: 'medium'
      });

      console.log('🟢 Trading application is running');
      console.log('Press Ctrl+C to stop');

      // Keep the process alive
      this.keepAlive();

    } catch (error) {
      console.error('❌ Failed to start application:', error.message);
      throw error;
    }
  }

  async stop() {
    if (!this.running) return;

    console.log('🛑 Stopping trading application...');

    try {
      // Stop data collection
      if (this.dataAggregator) {
        this.dataAggregator.stop();
        console.log('✓ Data collection stopped');
      }

      // Stop trading engine
      if (this.tradingEngine) {
        await this.tradingEngine.stop();
        console.log('✓ Trading engine stopped');
      }

      this.running = false;

      await this.notificationManager.notifySystemEvent({
        type: 'application_stopped',
        message: 'Trading application stopped',
        priority: 'medium'
      });

      console.log('🔴 Trading application stopped');
    } catch (error) {
      console.error('❌ Error during shutdown:', error.message);
    }
  }

  async handleShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    await this.stop();
    process.exit(0);
  }

  async handleError(error) {
    console.error('💥 Unhandled error:', error);
    
    if (this.notificationManager) {
      await this.notificationManager.notifySystemEvent({
        type: 'system_error',
        message: `Unhandled error: ${error.message}`,
        data: { stack: error.stack },
        priority: 'critical'
      });
    }

    process.exit(1);
  }

  keepAlive() {
    // Simple keep-alive mechanism
    setInterval(() => {
      if (this.running) {
        // Optional: Add health checks or periodic tasks here
      }
    }, 30000); // 30 seconds
  }

  // CLI interface methods
  async showStatus() {
    console.log('\n📊 Trading Application Status');
    console.log('============================');
    
    // Broker status
    console.log('\n🏦 Brokers:');
    for (const [name, broker] of Object.entries(this.brokers)) {
      try {
        const account = await broker.getAccountInfo();
        console.log(`  ${name}: Connected (Balance: $${account.cash})`);
      } catch (error) {
        console.log(`  ${name}: Error - ${error.message}`);
      }
    }

    // Positions
    console.log('\n📈 Positions:');
    const positions = this.tradingEngine.getPositions();
    if (positions.length === 0) {
      console.log('  No open positions');
    } else {
      positions.forEach(pos => {
        console.log(`  ${pos.symbol}: ${pos.qty} shares (${pos.side}) - P&L: $${pos.unrealizedPnl || 0}`);
      });
    }

    // Recent orders
    console.log('\n📋 Recent Orders:');
    const orders = this.tradingEngine.getOrders().slice(-5);
    if (orders.length === 0) {
      console.log('  No recent orders');
    } else {
      orders.forEach(order => {
        console.log(`  ${order.orderId}: ${order.side} ${order.qty} ${order.symbol} - ${order.status}`);
      });
    }

    // Data collection status
    if (this.dataAggregator) {
      console.log('\n📰 Data Collection:');
      const latestData = this.dataAggregator.getLatestData();
      if (latestData) {
        console.log(`  Last collected: ${latestData.timestamp}`);
        console.log(`  News articles: ${latestData.news.length}`);
        console.log(`  Social posts: ${latestData.social.length}`);
      } else {
        console.log('  No data collected yet');
      }
    }
  }
}

// CLI interface
async function main() {
  const app = new TradingApplication();

  const command = process.argv[2];

  try {
    await app.initialize();

    switch (command) {
      case 'start':
        await app.start();
        break;
      
      case 'status':
        await app.showStatus();
        process.exit(0);
        break;
      
      default:
        console.log('Usage: node src/index.js [start|status]');
        console.log('  start  - Start the trading application');
        console.log('  status - Show application status');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Application failed:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default TradingApplication;