import axios from 'axios';
import puppeteer from 'puppeteer';

class SocialMediaCollector {
  constructor(config) {
    this.config = config;
    this.twitterBearerToken = config.twitterBearerToken;
  }

  async collectTwitterData(symbols = [], keywords = []) {
    if (!this.twitterBearerToken) {
      console.warn('No Twitter bearer token provided');
      return [];
    }

    const tweets = [];
    const queries = [...symbols.map(s => `$${s}`), ...keywords];

    for (const query of queries) {
      try {
        const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
          headers: {
            'Authorization': `Bearer ${this.twitterBearerToken}`
          },
          params: {
            query: `${query} -is:retweet lang:en`,
            max_results: 50,
            'tweet.fields': 'created_at,public_metrics,context_annotations',
            'user.fields': 'verified,public_metrics'
          }
        });

        if (response.data.data) {
          tweets.push(...response.data.data.map(tweet => ({
            id: tweet.id,
            text: tweet.text,
            createdAt: new Date(tweet.created_at),
            metrics: tweet.public_metrics,
            source: 'twitter',
            query,
            sentiment: null,
            relevantSymbols: this.extractSymbols(tweet.text, symbols)
          })));
        }
      } catch (error) {
        console.error(`Error collecting Twitter data for ${query}:`, error.message);
      }
    }

    return tweets;
  }

  async collectRedditData(symbols = [], subreddits = ['wallstreetbets', 'stocks', 'investing']) {
    const posts = [];

    for (const subreddit of subreddits) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json`, {
          headers: {
            'User-Agent': 'TradingBot/1.0'
          },
          params: {
            limit: 25
          }
        });

        const relevantPosts = response.data.data.children
          .map(child => child.data)
          .filter(post => {
            const text = (post.title + ' ' + post.selftext).toLowerCase();
            return symbols.some(symbol => 
              text.includes(symbol.toLowerCase()) || 
              text.includes(`$${symbol.toLowerCase()}`)
            );
          });

        posts.push(...relevantPosts.map(post => ({
          id: post.id,
          title: post.title,
          text: post.selftext,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          numComments: post.num_comments,
          createdAt: new Date(post.created_utc * 1000),
          subreddit: post.subreddit,
          source: 'reddit',
          sentiment: null,
          relevantSymbols: this.extractSymbols(post.title + ' ' + post.selftext, symbols)
        })));
      } catch (error) {
        console.error(`Error collecting Reddit data from ${subreddit}:`, error.message);
      }
    }

    return posts;
  }

  async collectDiscordData(symbols = []) {
    // Discord scraping would require bot tokens and server access
    // This is a placeholder for potential Discord integration
    console.warn('Discord data collection not implemented - requires bot setup');
    return [];
  }

  async scrapeFinanceBlogs(symbols = []) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const blogPosts = [];

    const blogUrls = [
      'https://seekingalpha.com/market-news',
      'https://www.fool.com/investing/news/'
    ];

    for (const url of blogUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle0' });
        
        const articles = await page.evaluate((symbols) => {
          const articles = [];
          const links = document.querySelectorAll('a[href*="/news/"], a[href*="/article/"]');
          
          links.forEach(link => {
            const title = link.textContent.trim();
            const href = link.href;
            
            if (title && href && title.length > 10) {
              const relevantSymbols = symbols.filter(symbol => 
                title.toLowerCase().includes(symbol.toLowerCase()) ||
                title.includes(`$${symbol.toUpperCase()}`)
              );
              
              if (relevantSymbols.length > 0) {
                articles.push({
                  title,
                  url: href,
                  relevantSymbols
                });
              }
            }
          });
          
          return articles.slice(0, 10);
        }, symbols);

        blogPosts.push(...articles.map(article => ({
          id: this.generateId(article.url),
          title: article.title,
          url: article.url,
          source: new URL(url).hostname,
          createdAt: new Date(),
          sentiment: null,
          relevantSymbols: article.relevantSymbols
        })));

      } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
      }
    }

    await browser.close();
    return blogPosts;
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

  generateId(url) {
    return Buffer.from(url).toString('base64').slice(0, 16);
  }

  async analyzeSocialSentiment(posts) {
    const positiveWords = ['moon', 'rocket', 'bull', 'up', 'buy', 'hold', 'diamond', 'strong'];
    const negativeWords = ['crash', 'bear', 'down', 'sell', 'dump', 'weak', 'paper'];

    return posts.map(post => {
      const text = (post.text || post.title || '').toLowerCase();
      let score = 0;
      
      positiveWords.forEach(word => {
        const matches = (text.match(new RegExp(word, 'g')) || []).length;
        score += matches;
      });
      
      negativeWords.forEach(word => {
        const matches = (text.match(new RegExp(word, 'g')) || []).length;
        score -= matches;
      });

      post.sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
      post.sentimentScore = score;
      
      return post;
    });
  }
}

export default SocialMediaCollector;