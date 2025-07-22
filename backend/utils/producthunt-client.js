require('dotenv').config();
const axios = require('axios');

class ProductHuntClient {
  constructor() {
    this.baseURL = 'https://api.producthunt.com/v2/api/graphql';
    this.token = process.env.PRODUCTHUNT_API_TOKEN;
    
    if (!this.token || this.token === 'your_product_hunt_api_token_here') {
      console.warn('PRODUCTHUNT_API_TOKEN not configured properly in environment variables');
      console.warn('Please visit https://api.producthunt.com/v2/docs to create an app and get your API token');
    }
  }

  async makeRequest(query, variables = {}) {
    if (!this.token || this.token === 'your_product_hunt_api_token_here') {
      throw new Error('Product Hunt API token not configured properly. Please set PRODUCTHUNT_API_TOKEN in your .env file. Visit https://api.producthunt.com/v2/docs to create an app and get your API token.');
    }

    try {
      const response = await axios.post(this.baseURL, {
        query,
        variables
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = response.data;
      
      if (data.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
      }

      return data.data;
    } catch (error) {
      console.error('Product Hunt API request failed:', error.response?.data || error.message);
      
      // Provide more specific error messages
      if (error.response?.status === 401) {
        throw new Error('Product Hunt API authentication failed. Please check your PRODUCTHUNT_API_TOKEN.');
      } else if (error.response?.status === 403) {
        throw new Error('Product Hunt API access forbidden. Please verify your token has the correct permissions.');
      } else if (error.response?.status === 429) {
        throw new Error('Product Hunt API rate limit exceeded. Please try again later.');
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new Error('Cannot connect to Product Hunt API. Please check your internet connection.');
      }
      
      throw new Error(`Product Hunt API error: ${error.message}`);
    }
  }

  async getTodayTopPosts(limit = 20) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const query = `
      query getTodayPosts($postedAfter: DateTime!, $first: Int!) {
        posts(postedAfter: $postedAfter, order: RANKING, first: $first) {
          edges {
            node {
              id
              name
              tagline
              description
              votesCount
              url
              website
              featuredAt
              createdAt
              makers {
                name
                twitterUsername
              }
              media {
                type
                url
              }
              thumbnail {
                url
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = {
      postedAfter: `${todayStr}T00:00:00Z`,
      first: limit
    };

    try {
      const data = await this.makeRequest(query, variables);
      return this.transformPostsData(data.posts.edges);
    } catch (error) {
      console.error('Error fetching today top posts:', error);
      throw error;
    }
  }

  async getFeaturedPosts(limit = 20) {
    const query = `
      query getFeaturedPosts($first: Int!) {
        posts(featured: true, order: RANKING, first: $first) {
          edges {
            node {
              id
              name
              tagline
              description
              votesCount
              url
              website
              featuredAt
              createdAt
              makers {
                name
                twitterUsername
              }
              media {
                type
                url
              }
              thumbnail {
                url
              }
            }
          }
        }
      }
    `;

    const variables = { first: limit };

    try {
      const data = await this.makeRequest(query, variables);
      return this.transformPostsData(data.posts.edges);
    } catch (error) {
      console.error('Error fetching featured posts:', error);
      throw error;
    }
  }

  transformPostsData(edges) {
    return edges.map(edge => {
      const post = edge.node;
      return {
        id: post.id,
        title: post.name,
        tagline: post.tagline,
        description: post.description || post.tagline,
        link: post.url || post.website,
        website: post.website,
        votesCount: post.votesCount,
        featuredAt: post.featuredAt,
        createdAt: post.createdAt,
        makers: post.makers?.map(maker => ({
          name: maker.name,
          twitterUsername: maker.twitterUsername
        })) || [],
        media: post.media || [],
        thumbnailUrl: post.thumbnail?.url,
        guid: `producthunt-${post.id}`, // Unique identifier for deduplication
        pubDate: post.featuredAt || post.createdAt
      };
    });
  }

  async testConnection() {
    try {
      const query = `
        query {
          viewer {
            user {
              name
              username
            }
          }
        }
      `;
      
      const data = await this.makeRequest(query);
      console.log('Product Hunt API connection successful:', data.viewer?.user);
      return true;
    } catch (error) {
      console.error('Product Hunt API connection failed:', error);
      return false;
    }
  }
}

module.exports = new ProductHuntClient();