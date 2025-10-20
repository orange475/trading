import axios from 'axios';
import EventEmitter from 'events';

class NotificationManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.channels = {
      webhook: config.webhookUrl ? new WebhookNotifier(config.webhookUrl) : null,
      console: new ConsoleNotifier(),
      email: config.email ? new EmailNotifier(config.email) : null
    };
    this.enabled = config.enabled !== false;
    this.filters = config.filters || {};
  }

  async sendNotification(type, data, priority = 'medium') {
    if (!this.enabled) return;

    // Apply filters
    if (!this.shouldSendNotification(type, data, priority)) {
      return;
    }

    const notification = {
      type,
      data,
      priority,
      timestamp: new Date(),
      id: this.generateNotificationId()
    };

    const promises = [];

    // Send to enabled channels based on priority
    for (const [channelName, notifier] of Object.entries(this.channels)) {
      if (notifier && this.shouldUseChannel(channelName, priority)) {
        promises.push(
          notifier.send(notification).catch(error => {
            console.error(`Failed to send notification via ${channelName}:`, error.message);
            this.emit('notification_failed', { channel: channelName, error, notification });
          })
        );
      }
    }

    await Promise.all(promises);
    this.emit('notification_sent', notification);
  }

  shouldSendNotification(type, data, priority) {
    // Priority filter
    if (this.filters.minPriority) {
      const priorities = { low: 1, medium: 2, high: 3, critical: 4 };
      if (priorities[priority] < priorities[this.filters.minPriority]) {
        return false;
      }
    }

    // Type filter
    if (this.filters.excludeTypes && this.filters.excludeTypes.includes(type)) {
      return false;
    }

    if (this.filters.includeTypes && !this.filters.includeTypes.includes(type)) {
      return false;
    }

    // Symbol filter
    if (data.symbol && this.filters.symbols) {
      if (!this.filters.symbols.includes(data.symbol)) {
        return false;
      }
    }

    return true;
  }

  shouldUseChannel(channelName, priority) {
    const channelConfig = this.config.channels?.[channelName];
    
    if (!channelConfig) {
      // Default behavior: console for all, webhook for medium+, email for high+
      if (channelName === 'console') return true;
      if (channelName === 'webhook') return ['medium', 'high', 'critical'].includes(priority);
      if (channelName === 'email') return ['high', 'critical'].includes(priority);
    }

    return channelConfig.enabled !== false && 
           (!channelConfig.minPriority || this.getPriorityLevel(priority) >= this.getPriorityLevel(channelConfig.minPriority));
  }

  getPriorityLevel(priority) {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[priority] || 2;
  }

  generateNotificationId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Convenience methods for common notification types
  async notifyOrderPlaced(order) {
    await this.sendNotification('order_placed', {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.qty,
      type: order.type,
      message: `Order placed: ${order.side.toUpperCase()} ${order.qty} ${order.symbol}`
    }, 'medium');
  }

  async notifyOrderFilled(order) {
    await this.sendNotification('order_filled', {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.filledQty,
      avgPrice: order.avgFillPrice,
      message: `Order filled: ${order.side.toUpperCase()} ${order.filledQty} ${order.symbol} @ $${order.avgFillPrice}`
    }, 'high');
  }

  async notifySignificantEvent(event) {
    await this.sendNotification('significant_event', {
      symbol: event.symbol,
      type: event.type,
      severity: event.severity,
      description: event.description,
      message: `${event.severity.toUpperCase()}: ${event.description}`
    }, event.severity === 'high' ? 'high' : 'medium');
  }

  async notifyRiskEvent(riskEvent) {
    await this.sendNotification('risk_event', {
      type: riskEvent.type,
      message: riskEvent.message,
      data: riskEvent.data
    }, 'high');
  }

  async notifySystemEvent(event) {
    await this.sendNotification('system_event', {
      event: event.type,
      message: event.message,
      data: event.data
    }, event.priority || 'medium');
  }

  enable() {
    this.enabled = true;
    this.emit('enabled');
  }

  disable() {
    this.enabled = false;
    this.emit('disabled');
  }

  updateFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    this.emit('filters_updated', this.filters);
  }
}

class WebhookNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async send(notification) {
    const payload = {
      embeds: [{
        title: this.getTitle(notification),
        description: notification.data.message,
        color: this.getColor(notification.priority),
        fields: this.getFields(notification),
        timestamp: notification.timestamp.toISOString()
      }]
    };

    await axios.post(this.webhookUrl, payload);
  }

  getTitle(notification) {
    const titles = {
      order_placed: '📋 Order Placed',
      order_filled: '✅ Order Filled',
      significant_event: '🚨 Significant Event',
      risk_event: '⚠️ Risk Alert',
      system_event: '🔧 System Event'
    };
    return titles[notification.type] || '📢 Trading Alert';
  }

  getColor(priority) {
    const colors = {
      low: 0x808080,      // Gray
      medium: 0x3498db,   // Blue
      high: 0xf39c12,     // Orange
      critical: 0xe74c3c  // Red
    };
    return colors[priority] || colors.medium;
  }

  getFields(notification) {
    const fields = [];
    
    if (notification.data.symbol) {
      fields.push({ name: 'Symbol', value: notification.data.symbol, inline: true });
    }
    
    if (notification.data.orderId) {
      fields.push({ name: 'Order ID', value: notification.data.orderId, inline: true });
    }
    
    if (notification.data.quantity) {
      fields.push({ name: 'Quantity', value: notification.data.quantity.toString(), inline: true });
    }

    return fields;
  }
}

class ConsoleNotifier {
  async send(notification) {
    const timestamp = notification.timestamp.toISOString();
    const priority = notification.priority.toUpperCase();
    const type = notification.type.toUpperCase();
    const message = notification.data.message;
    
    const colorCodes = {
      LOW: '\x1b[37m',     // White
      MEDIUM: '\x1b[36m',  // Cyan
      HIGH: '\x1b[33m',    // Yellow
      CRITICAL: '\x1b[31m' // Red
    };
    
    const color = colorCodes[priority] || colorCodes.MEDIUM;
    const reset = '\x1b[0m';
    
    console.log(`${color}[${timestamp}] [${priority}] [${type}] ${message}${reset}`);
  }
}

class EmailNotifier {
  constructor(config) {
    this.config = config;
    // Email functionality would require a service like SendGrid, SES, etc.
    console.warn('Email notifications not implemented - requires email service setup');
  }

  async send(notification) {
    // Placeholder for email implementation
    console.log(`[EMAIL] ${notification.data.message}`);
  }
}

export default NotificationManager;