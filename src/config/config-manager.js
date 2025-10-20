import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || join(__dirname, '../../config.json');
    this.config = this.loadConfig();
    this.watchers = new Set();
  }

  loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf8');
        return JSON.parse(configData);
      } else {
        return this.getDefaultConfig();
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}, using defaults:`, error.message);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      brokers: {
        alpaca: {
          enabled: true,
          apiKey: process.env.ALPACA_API_KEY,
          secretKey: process.env.ALPACA_SECRET_KEY,
          baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'
        },
        tdAmeritrade: {
          enabled: false,
          clientId: process.env.TD_AMERITRADE_CLIENT_ID,
          refreshToken: process.env.TD_AMERITRADE_REFRESH_TOKEN
        },
        interactiveBrokers: {
          enabled: false,
          clientId: process.env.IBKR_CLIENT_ID,
          clientSecret: process.env.IBKR_CLIENT_SECRET
        }
      },
      dataCollection: {
        enabled: true,
        interval: 300000, // 5 minutes
        watchlist: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'],
        keywords: ['earnings', 'FDA approval', 'merger', 'acquisition'],
        news: {
          newsApiKey: process.env.NEWS_API_KEY,
          sources: ['newsapi', 'yahoo_finance', 'marketwatch']
        },
        socialMedia: {
          twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
          redditSubreddits: ['wallstreetbets', 'stocks', 'investing'],
          blogSources: ['seekingalpha', 'fool']
        }
      },
      trading: {
        enabled: true,
        executionInterval: 1000, // 1 second
        strategies: {
          newsBasedTrading: {
            enabled: false,
            sentimentThreshold: 0.6,
            buzzThreshold: 50,
            positionSize: 100
          }
        }
      },
      riskManagement: {
        maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE) || 1000,
        maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 500,
        maxPortfolioRisk: 0.02,
        stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 0.02,
        maxOpenPositions: 10,
        blacklistedSymbols: []
      },
      notifications: {
        enabled: true,
        webhookUrl: process.env.WEBHOOK_URL,
        email: {
          enabled: process.env.EMAIL_NOTIFICATIONS === 'true',
          service: 'gmail',
          user: process.env.EMAIL_USER,
          password: process.env.EMAIL_PASSWORD,
          to: process.env.EMAIL_TO
        },
        filters: {
          minPriority: 'medium',
          includeTypes: ['order_filled', 'significant_event', 'risk_event'],
          symbols: []
        }
      },
      database: {
        type: 'sqlite',
        path: process.env.DATABASE_PATH || './data/trading.db',
        redis: {
          url: process.env.REDIS_URL || 'redis://localhost:6379'
        }
      },
      server: {
        enabled: true,
        port: parseInt(process.env.PORT) || 3000,
        host: '0.0.0.0'
      },
      logging: {
        level: 'info',
        file: './logs/trading.log',
        maxSize: '10m',
        maxFiles: '5'
      }
    };
  }

  saveConfig() {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      this.notifyWatchers('config_saved', this.config);
    } catch (error) {
      console.error(`Failed to save config to ${this.configPath}:`, error.message);
      throw error;
    }
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let obj = this.config;
    
    // Navigate to the parent object
    for (const k of keys) {
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    const oldValue = obj[lastKey];
    obj[lastKey] = value;
    
    this.notifyWatchers('config_changed', {
      key,
      oldValue,
      newValue: value
    });
  }

  getBrokerConfig(brokerName) {
    return this.get(`brokers.${brokerName}`);
  }

  setBrokerConfig(brokerName, config) {
    this.set(`brokers.${brokerName}`, config);
  }

  getEnabledBrokers() {
    const brokers = this.get('brokers') || {};
    return Object.entries(brokers)
      .filter(([_, config]) => config.enabled)
      .map(([name, config]) => ({ name, config }));
  }

  enableBroker(brokerName) {
    this.set(`brokers.${brokerName}.enabled`, true);
  }

  disableBroker(brokerName) {
    this.set(`brokers.${brokerName}.enabled`, false);
  }

  addToWatchlist(symbol) {
    const watchlist = this.get('dataCollection.watchlist') || [];
    if (!watchlist.includes(symbol)) {
      watchlist.push(symbol);
      this.set('dataCollection.watchlist', watchlist);
    }
  }

  removeFromWatchlist(symbol) {
    const watchlist = this.get('dataCollection.watchlist') || [];
    const index = watchlist.indexOf(symbol);
    if (index > -1) {
      watchlist.splice(index, 1);
      this.set('dataCollection.watchlist', watchlist);
    }
  }

  getWatchlist() {
    return this.get('dataCollection.watchlist') || [];
  }

  enableStrategy(strategyName) {
    this.set(`trading.strategies.${strategyName}.enabled`, true);
  }

  disableStrategy(strategyName) {
    this.set(`trading.strategies.${strategyName}.enabled`, false);
  }

  getStrategyConfig(strategyName) {
    return this.get(`trading.strategies.${strategyName}`);
  }

  setStrategyConfig(strategyName, config) {
    this.set(`trading.strategies.${strategyName}`, config);
  }

  updateRiskLimits(limits) {
    const currentLimits = this.get('riskManagement') || {};
    this.set('riskManagement', { ...currentLimits, ...limits });
  }

  getRiskLimits() {
    return this.get('riskManagement') || {};
  }

  addToBlacklist(symbol) {
    const blacklist = this.get('riskManagement.blacklistedSymbols') || [];
    if (!blacklist.includes(symbol)) {
      blacklist.push(symbol);
      this.set('riskManagement.blacklistedSymbols', blacklist);
    }
  }

  removeFromBlacklist(symbol) {
    const blacklist = this.get('riskManagement.blacklistedSymbols') || [];
    const index = blacklist.indexOf(symbol);
    if (index > -1) {
      blacklist.splice(index, 1);
      this.set('riskManagement.blacklistedSymbols', blacklist);
    }
  }

  updateNotificationFilters(filters) {
    const currentFilters = this.get('notifications.filters') || {};
    this.set('notifications.filters', { ...currentFilters, ...filters });
  }

  getNotificationConfig() {
    return this.get('notifications') || {};
  }

  // Configuration validation
  validate() {
    const errors = [];

    // Validate enabled brokers have required credentials
    const enabledBrokers = this.getEnabledBrokers();
    for (const { name, config } of enabledBrokers) {
      if (name === 'alpaca' && (!config.apiKey || !config.secretKey)) {
        errors.push(`Alpaca broker is enabled but missing API credentials`);
      }
      if (name === 'tdAmeritrade' && (!config.clientId || !config.refreshToken)) {
        errors.push(`TD Ameritrade broker is enabled but missing API credentials`);
      }
    }

    // Validate risk limits
    const riskLimits = this.getRiskLimits();
    if (riskLimits.maxPositionSize <= 0) {
      errors.push(`Invalid max position size: ${riskLimits.maxPositionSize}`);
    }
    if (riskLimits.maxDailyLoss <= 0) {
      errors.push(`Invalid max daily loss: ${riskLimits.maxDailyLoss}`);
    }

    // Validate watchlist
    const watchlist = this.getWatchlist();
    if (!Array.isArray(watchlist) || watchlist.length === 0) {
      errors.push(`Watchlist must be a non-empty array`);
    }

    return errors;
  }

  // Event system for configuration changes
  watch(callback) {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  notifyWatchers(event, data) {
    for (const callback of this.watchers) {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Config watcher error:', error);
      }
    }
  }

  // Export/Import configuration
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  importConfig(configString) {
    try {
      const newConfig = JSON.parse(configString);
      this.config = { ...this.getDefaultConfig(), ...newConfig };
      this.notifyWatchers('config_imported', this.config);
    } catch (error) {
      throw new Error(`Invalid configuration format: ${error.message}`);
    }
  }

  reset() {
    this.config = this.getDefaultConfig();
    this.notifyWatchers('config_reset', this.config);
  }
}

export default ConfigManager;