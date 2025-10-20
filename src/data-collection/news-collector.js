import axios from 'axios';
import * as cheerio from 'cheerio';

class NewsCollector {
  constructor(config) {
    this.config = config;
    this.sources = [
      {
        name: 'newsapi',
        url: 'https://newsapi.org/v2/everything',
        key: config.newsApiKey
      },
      {
        name: 'yahoo_finance',
        url: 'https://finance.yahoo.com/news/',
        scraper: true
      },
      {
        name: 'marketwatch',
        url: 'https://www.marketwatch.com/markets',
        scraper: true
      }
    ];
  }

  async collectNews(symbols = [], keywords = []) {
    const allNews = [];
    
    for (const source of this.sources) {
      try {
        let news;
        if (source.scraper) {
          news = await this.scrapeNews(source, symbols, keywords);
        } else {
          news = await this.fetchNewsAPI(source, symbols, keywords);
        }
        allNews.push(...news);
      } catch (error) {
        console.error(`Error collecting from ${source.name}:`, error.message);
      }
    }

    return this.deduplicateNews(allNews);
  }

  async fetchNewsAPI(source, symbols, keywords) {
    if (!source.key) {
      console.warn(`No API key for ${source.name}`);
      return [];
    }

    const query = [...symbols, ...keywords].join(' OR ');
    const params = {
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: 50,
      apiKey: source.key
    };

    const response = await axios.get(source.url, { params });
    
    return response.data.articles.map(article => ({
      id: this.generateId(article.url),
      title: article.title,
      description: article.description,
      url: article.url,
      source: article.source.name,
      publishedAt: new Date(article.publishedAt),
      sentiment: null,
      relevantSymbols: this.extractSymbols(article.title + ' ' + article.description, symbols)
    }));
  }

  async scrapeNews(source, symbols, keywords) {
    try {
      const response = await axios.get(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const articles = [];

      if (source.name === 'yahoo_finance') {
        $('.Mb\\(5px\\)').each((i, element) => {
          const title = $(element).find('h3 a').text().trim();
          const url = $(element).find('h3 a').attr('href');
          const description = $(element).find('.finance-ticker-fetch-success_D\\(n\\)').text().trim();
          
          if (title && url) {
            articles.push({
              id: this.generateId(url),
              title,
              description,
              url: url.startsWith('http') ? url : `https://finance.yahoo.com${url}`,
              source: 'Yahoo Finance',
              publishedAt: new Date(),
              sentiment: null,
              relevantSymbols: this.extractSymbols(title + ' ' + description, symbols)
            });
          }
        });
      }

      return articles;
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error.message);
      return [];
    }
  }

  extractSymbols(text, symbols) {
    const found = [];
    const upperText = text.toUpperCase();
    
    for (const symbol of symbols) {
      if (upperText.includes(symbol.toUpperCase()) || 
          upperText.includes(`$${symbol.toUpperCase()}`)) {
        found.push(symbol);
      }
    }
    
    return found;
  }

  deduplicateNews(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  generateId(url) {
    return Buffer.from(url).toString('base64').slice(0, 16);
  }

  async analyzeSentiment(articles) {
    // Simple keyword-based sentiment analysis
    const positiveWords = ['bull', 'bullish', 'gain', 'rise', 'up', 'positive', 'growth', 'strong'];
    const negativeWords = ['bear', 'bearish', 'fall', 'drop', 'down', 'negative', 'decline', 'weak'];

    return articles.map(article => {
      const text = (article.title + ' ' + article.description).toLowerCase();
      let score = 0;
      
      positiveWords.forEach(word => {
        if (text.includes(word)) score += 1;
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) score -= 1;
      });

      article.sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
      article.sentimentScore = score;
      
      return article;
    });
  }
}

export default NewsCollector;