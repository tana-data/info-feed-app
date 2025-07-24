require('dotenv').config();
const axios = require('axios');

class ProductHuntClient {
  constructor() {
    this.baseURL = 'https://api.producthunt.com/v2/api/graphql';
    this.oauthURL = 'https://api.producthunt.com/v2/oauth/token';
    this.clientId = process.env.PRODUCTHUNT_CLIENT_ID;
    this.clientSecret = process.env.PRODUCTHUNT_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    if (!this.clientId || this.clientId === 'your_client_id_here') {
      console.warn('PRODUCTHUNT_CLIENT_ID not configured properly in environment variables');
      console.warn('Please visit https://api.producthunt.com/v2/docs to create an app and get your client credentials');
    }
    
    if (!this.clientSecret || this.clientSecret === 'your_client_secret_here') {
      console.warn('PRODUCTHUNT_CLIENT_SECRET not configured properly in environment variables');
      console.warn('Please set your client secret from the Product Hunt API dashboard');
    }
  }

  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get new access token using client credentials
    if (!this.clientId || !this.clientSecret || 
        this.clientId === 'your_client_id_here' || 
        this.clientSecret === 'your_client_secret_here') {
      throw new Error('Product Hunt API client credentials not configured properly. Please set PRODUCTHUNT_CLIENT_ID and PRODUCTHUNT_CLIENT_SECRET in your .env file. Visit https://api.producthunt.com/v2/docs to create an app and get your client credentials.');
    }

    try {
      const response = await axios.post(this.oauthURL, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = response.data;
      this.accessToken = data.access_token;
      // Token typically expires in 1 hour, set expiry a bit earlier to be safe
      this.tokenExpiry = Date.now() + (data.expires_in ? (data.expires_in - 300) * 1000 : 3300 * 1000);
      
      console.log('✅ Product Hunt access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get Product Hunt access token:', error.response?.data || error.message);
      throw new Error(`Failed to obtain Product Hunt access token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async makeRequest(query, variables = {}) {
    const accessToken = await this.getAccessToken();

    try {
      const response = await axios.post(this.baseURL, {
        query,
        variables
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
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
        throw new Error('Product Hunt API authentication failed. Please check your client credentials.');
      } else if (error.response?.status === 403) {
        throw new Error('Product Hunt API access forbidden. Please verify your client credentials have the correct permissions.');
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