/**
 * @license
 * ISC License
 * 
 * Copyright (c) 2023 KhulnaSoft, Ltd
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const { Octokit } = require("@octokit/rest");
const logger = require('../utils/logger');

/**
 * GitHubClient class for interacting with GitHub API
 */
class GitHubClient {
  constructor(token) {
    this.client = new Octokit({
      auth: token
    });
  }

  /**
   * Validates if the provided GitHub token is valid
   * @returns {Promise<{valid: boolean, user?: string, error?: string}>} - Object indicating if token is valid, and if so, which user it belongs to
   */
  async validateToken() {
    try {
      // Make a request to the /user endpoint which requires authentication
      const { data } = await this.client.users.getAuthenticated();
      logger.info(`✅ Token validated successfully for user: ${data.login}`);
      return { 
        valid: true, 
        user: data.login 
      };
    } catch (error) {
      // Check for authentication errors (401 Unauthorized)
      if (error.status === 401) {
        logger.warn('⚠️ Invalid GitHub token provided');
        return { 
          valid: false, 
          error: 'Invalid or expired GitHub token' 
        };
      }
      
      // Handle rate limiting
      if (error.status === 403 && error.response?.headers?.['x-ratelimit-remaining'] === '0') {
        logger.warn('⚠️ GitHub API rate limit exceeded');
        return { 
          valid: false, 
          error: 'GitHub API rate limit exceeded' 
        };
      }
      
      // Log other unexpected errors
      logger.error('❌ Error validating GitHub token:', error);
      return { 
        valid: false, 
        error: `Token validation failed: ${error.message}` 
      };
    }
  }

  /**
   * Fetches a single repository by owner and name
   * @param {string} owner - Owner of the repository
   * @param {string} repo - Name of the repository
   * @returns {Promise<Object>} Repository information
   */
  async getRepository(owner, repo) {
    try {
      const { data } = await this.client.repos.get({ owner, repo });
      logger.info(`✅ Retrieved repository ${owner}/${repo}`);
      return {
        url: data.html_url,
        private: data.private,
        forked: data.fork,
        archived: data.archived,
        owner: data.owner.login,
        name: data.name,
        id: data.id,
        defaultBranch: data.default_branch
      };
    } catch (error) {
      logger.error(`❌ Failed to get repository ${owner}/${repo}:`, error);
      throw error;
    }
  }

  /**
   * Lists repositories for an organization
   * @param {string} org - Organization name
   * @returns {Promise<Array>} - List of repositories
   */
  async listRepositories(org) {
    try {
      logger.info(`\U0001F50D Listing repositories for organization ${org}...`);
      const repos = await this._paginate(
        this.client.repos.listForOrg.endpoint.merge({
          org,
          type: 'all',
          sort: 'full_name',
          direction: 'asc',
          per_page: 100
        })
      );
      
      logger.info(`✅ Found ${repos.length} repositories for organization ${org}`);
      return repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        url: repo.html_url,
        private: repo.private,
        forked: repo.fork,
        archived: repo.archived,
        owner: repo.owner.login,
        defaultBranch: repo.default_branch
      }));
    } catch (error) {
      logger.error(`❌ Failed to list repositories for org ${org}:`, error);
      throw error;
    }
  }

  /**
   * Paginates through API results
   * @param {Function} requestFunction - Request function to paginate
   * @returns {Promise<Array>} - Combined results
   */
  async _paginate(requestFunction) {
    try {
      return await this.client.paginate(requestFunction);
    } catch (error) {
      logger.error(`❌ Pagination failed:`, error);
      throw error;
    }
  }
}

module.exports = GitHubClient;

