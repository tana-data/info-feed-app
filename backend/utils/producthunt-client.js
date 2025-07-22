require('dotenv').config();
const axios = require('axios');

class ProductHuntClient {
  constructor() {
    this.baseURL = 'https://api.producthunt.com/v2/api/graphql';
    this.token = process.env.PRODUCTHUNT_API_TOKEN;
    
    if (!this.token) {
      console.warn('PRODUCTHUNT_API_TOKEN not found in environment variables');
    }
  }

  async makeRequest(query, variables = {}) {
    if (!this.token) {
      throw new Error('Product Hunt API token not configured');
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
      console.error('Product Hunt API request failed:', error);
      throw error;
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