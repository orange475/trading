import NewsCollector from './news-collector.js';
import SocialMediaCollector from './social-media-collector.js';
import EventEmitter from 'events';

class DataAggregator extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.newsCollector = new NewsCollector(config.news || {});
    this.socialMediaCollector = new SocialMediaCollector(config.socialMedia || {});
    this.watchlist = config.watchlist || [];
    this.keywords = config.keywords || ['earnings', 'FDA approval', 'merger', 'acquisition'];
    this.collectInterval = config.collectInterval || 300000; // 5 minutes
    this.running = false;
    this.collectionTimer = null;
    this.cache = new Map();
  }

  addToWatchlist(symbol) {
    if (!this.watchlist.includes(symbol)) {
      this.watchlist.push(symbol);
      this.emit('watchlist_updated', { added: symbol });
    }
  }

  removeFromWatchlist(symbol) {
    const index = this.watchlist.indexOf(symbol);
    if (index > -1) {
      this.watchlist.splice(index, 1);
      this.emit('watchlist_updated', { removed: symbol });
    }
  }

  start() {
    if (this.running) {
      console.warn('Data aggregator is already running');
      return;
    }

    console.log('Starting data aggregation...');
    this.running = true;

    // Initial collection
    this.collectAllData();

    // Set up periodic collection
    this.collectionTimer = setInterval(() => {
      this.collectAllData();
    }, this.collectInterval);

    this.emit('started');
  }

  stop() {
    if (!this.running) return;

    console.log('Stopping data aggregation...');
    this.running = false;

    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = null;
    }

    this.emit('stopped');
  }

  async collectAllData() {
    if (!this.running) return;

    console.log('Collecting market intelligence data...');
    
    try {
      const [newsData, socialData] = await Promise.all([
        this.collectNewsData(),
        this.collectSocialData()
      ]);

      const aggregatedData = {
        timestamp: new Date(),
        news: newsData,
        social: socialData,
        summary: this.generateSummary(newsData, socialData)
      };

      this.cache.set('latest', aggregatedData);
      this.emit('data_collected', aggregatedData);
      
      console.log(`Collected ${newsData.length} news articles and ${socialData.length} social posts`);
      
      // Detect significant events
      const events = this.detectSignificantEvents(aggregatedData);
      if (events.length > 0) {
        this.emit('significant_events', events);
      }

    } catch (error) {
      console.error('Error during data collection:', error);
      this.emit('collection_error', error);
    }
  }

  async collectNewsData() {
    try {
      const newsArticles = await this.newsCollector.collectNews(this.watchlist, this.keywords);
      const analyzedNews = await this.newsCollector.analyzeSentiment(newsArticles);
      return analyzedNews;
    } catch (error) {
      console.error('Error collecting news data:', error);
      return [];
    }
  }

  async collectSocialData() {
    try {
      const [twitterData, redditData, blogData] = await Promise.all([
        this.socialMediaCollector.collectTwitterData(this.watchlist, this.keywords),
        this.socialMediaCollector.collectRedditData(this.watchlist),
        this.socialMediaCollector.scrapeFinanceBlogs(this.watchlist)
      ]);

      const allSocialData = [...twitterData, ...redditData, ...blogData];
      const analyzedSocialData = await this.socialMediaCollector.analyzeSocialSentiment(allSocialData);
      
      return analyzedSocialData;
    } catch (error) {
      console.error('Error collecting social media data:', error);
      return [];
    }
  }

  generateSummary(newsData, socialData) {
    const summary = {};

    // Analyze sentiment by symbol
    for (const symbol of this.watchlist) {
      const symbolNews = newsData.filter(article => 
        article.relevantSymbols.includes(symbol));
      const symbolSocial = socialData.filter(post => 
        post.relevantSymbols.includes(symbol));

      if (symbolNews.length > 0 || symbolSocial.length > 0) {
        summary[symbol] = this.analyzeSymbolData(symbol, symbolNews, symbolSocial);
      }
    }

    return summary;
  }

  analyzeSymbolData(symbol, news, social) {
    const allItems = [...news, ...social];
    
    const sentimentCounts = {
      positive: allItems.filter(item => item.sentiment === 'positive').length,
      negative: allItems.filter(item => item.sentiment === 'negative').length,
      neutral: allItems.filter(item => item.sentiment === 'neutral').length
    };

    const totalItems = allItems.length;
    const sentimentScore = totalItems > 0 
      ? (sentimentCounts.positive - sentimentCounts.negative) / totalItems 
      : 0;

    // Calculate buzz score (volume of mentions)
    const buzzScore = this.calculateBuzzScore(news, social);

    // Extract key topics/themes
    const topics = this.extractTopics(allItems);

    return {
      symbol,
      totalMentions: totalItems,
      newsMentions: news.length,
      socialMentions: social.length,
      sentimentCounts,
      sentimentScore,
      buzzScore,
      topics,
      lastUpdated: new Date()
    };
  }

  calculateBuzzScore(news, social) {
    // Simple buzz score calculation based on volume and engagement
    let score = news.length * 2; // News articles weighted higher
    
    social.forEach(post => {
      score += 1;
      
      // Add engagement metrics if available
      if (post.metrics) {
        score += (post.metrics.like_count || 0) * 0.001;
        score += (post.metrics.retweet_count || 0) * 0.002;
        score += (post.metrics.reply_count || 0) * 0.001;
      }
      
      if (post.score) { // Reddit score
        score += Math.max(0, post.score * 0.01);
      }
    });
    
    return Math.round(score);
  }

  extractTopics(items) {
    const topicKeywords = {
      'earnings': ['earnings', 'eps', 'revenue', 'profit', 'quarterly'],
      'fda': ['fda', 'approval', 'clinical trial', 'drug'],
      'merger': ['merger', 'acquisition', 'buyout', 'takeover'],
      'leadership': ['ceo', 'cfo', 'executive', 'management'],
      'product': ['launch', 'release', 'product', 'innovation'],
      'legal': ['lawsuit', 'court', 'settlement', 'regulatory']
    };

    const detectedTopics = {};
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const mentions = items.filter(item => {
        const text = ((item.title || '') + ' ' + (item.text || item.description || '')).toLowerCase();
        return keywords.some(keyword => text.includes(keyword));
      });
      
      if (mentions.length > 0) {
        detectedTopics[topic] = mentions.length;
      }
    }
    
    return detectedTopics;
  }

  detectSignificantEvents(data) {
    const events = [];
    
    for (const [symbol, analysis] of Object.entries(data.summary)) {
      // High buzz with strong sentiment
      if (analysis.buzzScore > 50 && Math.abs(analysis.sentimentScore) > 0.3) {
        events.push({
          type: 'high_sentiment_buzz',
          symbol,
          severity: Math.abs(analysis.sentimentScore) > 0.6 ? 'high' : 'medium',
          sentiment: analysis.sentimentScore > 0 ? 'positive' : 'negative',
          buzzScore: analysis.buzzScore,
          sentimentScore: analysis.sentimentScore,
          description: `High ${analysis.sentimentScore > 0 ? 'positive' : 'negative'} sentiment buzz for ${symbol}`
        });
      }

      // Unusual volume of mentions
      if (analysis.totalMentions > 20) {
        events.push({
          type: 'high_mention_volume',
          symbol,
          severity: 'medium',
          mentionCount: analysis.totalMentions,
          description: `Unusually high mention volume for ${symbol}: ${analysis.totalMentions} mentions`
        });
      }

      // FDA or earnings related mentions
      if (analysis.topics.fda || analysis.topics.earnings) {
        events.push({
          type: 'important_topic',
          symbol,
          severity: 'high',
          topics: analysis.topics,
          description: `Important developments detected for ${symbol}: ${Object.keys(analysis.topics).join(', ')}`
        });
      }
    }

    return events;
  }

  getLatestData() {
    return this.cache.get('latest');
  }

  getSymbolAnalysis(symbol) {
    const latestData = this.getLatestData();
    return latestData?.summary?.[symbol] || null;
  }

  setCollectionInterval(intervalMs) {
    this.collectInterval = intervalMs;
    
    if (this.running && this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = setInterval(() => {
        this.collectAllData();
      }, this.collectInterval);
    }
  }
}

export default DataAggregator;