# Trading Automation Tool

A comprehensive multi-broker trading automation system with integrated news and social media intelligence.

## 🚀 Features

- **Multi-Broker Support**: Connect to multiple brokers (Alpaca, TD Ameritrade, Interactive Brokers)
- **News & Social Intelligence**: Automated collection from news APIs, Twitter, Reddit, and financial blogs
- **Sentiment Analysis**: Real-time sentiment analysis of news and social media posts
- **Risk Management**: Built-in risk controls with position sizing, stop losses, and daily limits
- **Strategy Framework**: Extensible strategy system with built-in news-based trading
- **Real-time Notifications**: Discord/Slack webhooks, email, and console alerts
- **Configuration Management**: Flexible JSON-based configuration with environment variable support

## 📋 Prerequisites

- Node.js 18+ 
- Valid broker API credentials (Alpaca recommended for getting started)
- Optional: News API key, Twitter Bearer Token for enhanced data collection

## 🛠️ Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd trading
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API credentials
   ```

3. **Configure your settings:**
   ```bash
   # The application will create a default config.json on first run
   # You can also manually configure brokers, watchlist, and strategies
   ```

## ⚙️ Configuration

### Broker Setup

**Alpaca (Recommended for beginners):**
- Sign up at [Alpaca Markets](https://alpaca.markets)
- Get your API key and secret from the dashboard
- Set `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` in your .env file
- Use paper trading URL for testing: `https://paper-api.alpaca.markets`

**TD Ameritrade:**
- Apply for API access at TD Ameritrade Developer
- Set `TD_AMERITRADE_CLIENT_ID` and refresh token

### Data Sources

**News API:**
- Get free API key from [NewsAPI.org](https://newsapi.org)
- Set `NEWS_API_KEY` in your .env file

**Twitter API:**
- Apply for Twitter API v2 access
- Set `TWITTER_BEARER_TOKEN` in your .env file

## 🚀 Usage

### Basic Commands

```bash
# Start the trading application
npm start

# Check application status
node src/index.js status

# Development mode with auto-restart
npm run dev
```

### Configuration Options

```javascript
{
  "dataCollection": {
    "watchlist": ["AAPL", "GOOGL", "MSFT", "TSLA"],
    "keywords": ["earnings", "FDA approval", "merger"],
    "interval": 300000
  },
  "riskManagement": {
    "maxPositionSize": 1000,
    "maxDailyLoss": 500,
    "stopLossPercentage": 0.02
  },
  "trading": {
    "strategies": {
      "newsBasedTrading": {
        "enabled": true,
        "sentimentThreshold": 0.6,
        "buzzThreshold": 50
      }
    }
  }
}
```

## 📊 Strategies

### News-Based Strategy

The included news-based strategy:
- Monitors news sentiment and social media buzz
- Buys on strong positive sentiment + high buzz volume
- Implements automatic stop-losses and take-profits
- Configurable holding periods and position sizes

### Custom Strategies

Create custom strategies by extending `BaseStrategy`:

```javascript
import BaseStrategy from '../strategy-base.js';

class MyStrategy extends BaseStrategy {
  constructor(config) {
    super('MyStrategy', config);
  }

  async evaluate(marketData) {
    // Your trading logic here
    return signals; // Array of trading signals
  }
}
```

## 🔔 Notifications

Set up notifications via:
- **Discord/Slack Webhooks**: Real-time trading alerts
- **Console**: Development and debugging
- **Email**: High-priority alerts (requires setup)

Configure notification filters by priority, symbol, or event type.

## ⚠️ Risk Management

Built-in safety features:
- **Position Limits**: Maximum position sizes per symbol
- **Daily Loss Limits**: Stop trading after daily loss threshold
- **Portfolio Risk**: Limit exposure as percentage of portfolio
- **Symbol Blacklisting**: Exclude problematic symbols
- **Order Validation**: Pre-trade risk checks

## 🧪 Testing

**Paper Trading Recommended:**
- Always test strategies with paper trading first
- Use Alpaca's paper trading environment
- Monitor performance before using real money

**Backtesting:**
- Historical data integration planned
- Strategy performance metrics included

## 📁 Project Structure

```
src/
├── brokers/          # Broker integrations
├── data-collection/  # News & social media collectors
├── trading/          # Trading engine and strategies
├── config/           # Configuration management
├── notifications/    # Alert system
└── index.js          # Main application entry point
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## ⚖️ Legal & Disclaimer

**IMPORTANT**: This software is for educational and research purposes. 

- Trading involves substantial risk of loss
- Past performance does not guarantee future results
- Test thoroughly with paper trading before using real money
- Comply with all applicable laws and regulations
- The authors assume no responsibility for trading losses

## 🔧 Troubleshooting

**Common Issues:**

1. **Broker Connection Failed**: Check API credentials and network connectivity
2. **Data Collection Errors**: Verify API keys and rate limits
3. **Strategy Not Executing**: Check if trading is enabled and strategies are configured
4. **High CPU Usage**: Reduce data collection frequency or disable unused features

**Support:**
- Check the logs in `logs/trading.log`
- Review your configuration with `node src/index.js status`
- Ensure all required environment variables are set

## 📚 Resources

- [Alpaca API Documentation](https://alpaca.markets/docs/)
- [NewsAPI Documentation](https://newsapi.org/docs)
- [Twitter API v2 Guide](https://developer.twitter.com/en/docs/twitter-api)

---

**Happy Trading! 📈**