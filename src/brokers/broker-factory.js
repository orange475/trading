import AlpacaBroker from './alpaca-broker.js';

class BrokerFactory {
  static createBroker(brokerType, config) {
    switch (brokerType.toLowerCase()) {
      case 'alpaca':
        return new AlpacaBroker(config);
      
      case 'td_ameritrade':
        // TODO: Implement TD Ameritrade broker
        throw new Error('TD Ameritrade broker not yet implemented');
      
      case 'interactive_brokers':
        // TODO: Implement Interactive Brokers broker
        throw new Error('Interactive Brokers broker not yet implemented');
      
      default:
        throw new Error(`Unsupported broker type: ${brokerType}`);
    }
  }

  static getSupportedBrokers() {
    return [
      {
        name: 'alpaca',
        displayName: 'Alpaca Markets',
        supported: true,
        features: ['stocks', 'options', 'crypto']
      },
      {
        name: 'td_ameritrade',
        displayName: 'TD Ameritrade',
        supported: false,
        features: ['stocks', 'options', 'futures']
      },
      {
        name: 'interactive_brokers',
        displayName: 'Interactive Brokers',
        supported: false,
        features: ['stocks', 'options', 'futures', 'forex']
      }
    ];
  }
}

export default BrokerFactory;