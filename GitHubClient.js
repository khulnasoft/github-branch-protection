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
const getProperty = require("lodash.get");
const winston = require("winston");

const KHULNASOFT_CHECKS = {
  POLICY: "Khulnasoft Smart Policy",
  INSIGHTS: "Khulnasoft Insights"
};

// Custom format for sanitizing sensitive data in logs
const sanitizeFormat = winston.format((info) => {
  if (info.message) {
    // Redact any tokens or secrets in the message
    info.message = typeof info.message === 'string' 
      ? info.message
          .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
          .replace(/github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, '[REDACTED_TOKEN]')
          .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]')
          .replace(/Authorization: [a-zA-Z0-9._-]+/g, 'Authorization: [REDACTED]')
      : info.message;
  }
  
  // Sanitize error objects
  if (info.error) {
    const sanitizedError = { ...info.error };
    if (sanitizedError.message) {
      sanitizedError.message = sanitizedError.message
        .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
        .replace(/github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, '[REDACTED_TOKEN]')
        .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]')
        .replace(/Authorization: [a-zA-Z0-9._-]+/g, 'Authorization: [REDACTED]');
    }
    info.error = sanitizedError;
  }
  
  return info;
})();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    sanitizeFormat,
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "github-client.log" })
  ]
});
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
   * Gets branch protection settings for a specific branch
   * @param {object} params - Parameters object
   * @param {string} params.owner - Owner of the repository
   * @param {string} params.repositoryName - Name of the repository
   * @param {string} params.branch - Branch name
   * @returns {Promise<Object|null>} Branch protection settings
   */
  async getBranchProtection({ owner, repositoryName, branch }) {
    return this._getBranchProtection({ owner, repositoryName, branch });
  }

  /**
   * Simulates removing checks from branch protection without applying changes
   * @param {object} params - Parameters object
   * @param {string} params.owner - Owner of the repository
   * @param {string} params.repositoryName - Name of the repository
   * @param {string} params.branch - Branch name
   * @param {string[]} params.checksToRemove - Array of check names to remove
   * @returns {Promise<Object>} Simulated branch protection settings
   */
  async simulateRemovingChecks({ owner, repositoryName, branch, checksToRemove = [] }) {
    try {
      let protectionSettingsData = await this._getBranchProtection({ owner, repositoryName, branch });
      if (!protectionSettingsData) {
        return { 
          error: 'No branch protection settings found',
          original: null,
          simulated: null
        };
      }

      const original = JSON.parse(JSON.stringify(protectionSettingsData));
      const statusChecks = protectionSettingsData.required_status_checks;
      
      if (!statusChecks?.checks || statusChecks.checks.length === 0) {
        return {
          message: 'No status checks found to remove',
          original,
          simulated: original
        };
      }

      // If no specific checks provided, use Khulnasoft checks as default
      const checksToFilter = checksToRemove.length 
        ? checksToRemove 
        : [KHULNASOFT_CHECKS.POLICY, KHULNASOFT_CHECKS.INSIGHTS];
        
      const originalChecksCount = statusChecks.checks.length;
      
      const filteredChecks = statusChecks.checks.filter(
        check => !checksToFilter.includes(check.context)
      );
      
      const simulated = JSON.parse(JSON.stringify(protectionSettingsData));
      if (filteredChecks.length) {
        simulated.required_status_checks.checks = filteredChecks;
      } else {
        simulated.required_status_checks = null;
      }
      
      return {
        message: `Would remove ${originalChecksCount - filteredChecks.length} of ${originalChecksCount} checks`,
        original,
        simulated
      };
    } catch (error) {
      logger.error(`❌ Failed to simulate removing checks for ${repositoryName}/${branch}:`, error);
      throw error;
    }
  }

  /**
   * Removes specified checks from branch protection
   * @param {object} params - Parameters object
   * @param {string} params.owner - Owner of the repository
   * @param {string} params.repositoryName - Name of the repository
   * @param {string} params.branch - Branch name
   * @param {string[]} params.checksToRemove - Array of check names to remove
   * @returns {Promise<void>}
   */
  async removeChecksFromBranchProtection({ owner, repositoryName, branch, checksToRemove = [] }) {
    try {
      let protectionSettingsData = await this._getBranchProtection({ owner, repositoryName, branch });
      if (!protectionSettingsData) protectionSettingsData = {};

      const enforceAdmins = this._getEnforceAdmins(protectionSettingsData);
      
      // Apply custom checks removal logic
      let required_status_checks = null;
      const statusChecks = protectionSettingsData.required_status_checks;
      
      if (statusChecks?.checks && statusChecks.checks.length > 0) {
        // Filter out specified checks
        const checksToFilter = checksToRemove.length 
          ? checksToRemove 
          : [KHULNASOFT_CHECKS.POLICY, KHULNASOFT_CHECKS.INSIGHTS];
          
        const filteredChecks = statusChecks.checks.filter(
          check => !checksToFilter.includes(check.context)
        );
        
        if (filteredChecks.length) {
          required_status_checks = { ...statusChecks, checks: filteredChecks };
        }
      }
      
      const restrictions = this._getRestrictions(protectionSettingsData);

      await this.client.repos.updateBranchProtection({
        owner,
        repo: repositoryName,
        branch,
        enforce_admins: enforceAdmins,
        required_status_checks,
        required_pull_request_reviews: protectionSettingsData.required_pull_request_reviews || null,
        restrictions,
        allow_force_pushes: protectionSettingsData.allow_force_pushes?.enabled ?? false,
        allow_deletions: protectionSettingsData.allow_deletions?.enabled ?? false
      });

      const checkNames = checksToRemove.length ? checksToRemove.join(', ') : 'Khulnasoft checks';
      logger.info(`✅ Removed ${checkNames} from branch protection for ${repositoryName}/${branch}`);
    } catch (error) {
      logger.error(`❌ Failed to remove checks from ${repositoryName}/${branch}:`, error);
      throw error;
    }
  }

  async removeKhulnasoftChecksFromBranchProtection({ owner, repositoryName, branch }) {
    try {
      let protectionSettingsData = await this._getBranchProtection({ owner, repositoryName, branch });
      if (!protectionSettingsData) protectionSettingsData = {};

      const enforceAdmins = this._getEnforceAdmins(protectionSettingsData);
      const required_status_checks = this.removeKhulnasoftChecks(protectionSettingsData);
      const restrictions = this._getRestrictions(protectionSettingsData);

      await this.client.repos.updateBranchProtection({
        owner,
        repo: repositoryName,
        branch,
        enforce_admins: enforceAdmins,
        required_status_checks,
        required_pull_request_reviews: protectionSettingsData.required_pull_request_reviews || null,
        restrictions,
        allow_force_pushes: protectionSettingsData.allow_force_pushes?.enabled ?? false,
        allow_deletions: protectionSettingsData.allow_deletions?.enabled ?? false
      });

      logger.info(`✅ Removed Khulnasoft checks from branch protection for ${repositoryName}/${branch}`);
    } catch (error) {
      logger.error(`❌ Failed to remove Khulnasoft checks from ${repositoryName}/${branch}:`, error);
      throw error;
    }
  }

  async listRepositories(org) {
    try {
      logger.info(`🔍 Listing repositories for organization ${org}...`);
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

  async _paginate(requestFunction) {
    try {
      return await this.client.paginate(requestFunction);
    } catch (error) {
      logger.error(`❌ Pagination failed:`, error);
      throw error;
    }
  }

  async _getBranchProtection({ owner, repositoryName, branch }) {
    try {
      const { data } = await this.client.repos.getBranchProtection({ owner, repo: repositoryName, branch });
      return data;
    } catch (err) {
      if (err.status === 404) {
        logger.warn(`⚠️ Branch ${branch} in ${repositoryName} is not protected.`);
        return undefined;
      }
      if (err.status === 403) {
        logger.warn(`⚠️ Cannot access branch protection for ${repositoryName}/${branch}: Upgrade required.`);
        return undefined;
      }

      logger.error(`❌ Failed to get branch protection for ${repositoryName}/${branch}:`, err);
      throw err;
    }
  }

  removeKhulnasoftChecks(githubBranchProtectionSettings) {
    const statusChecks = githubBranchProtectionSettings.required_status_checks;
    if (!statusChecks?.checks) return null;

    const filteredChecks = statusChecks.checks.filter(
      check => ![KHULNASOFT_CHECKS.POLICY, KHULNASOFT_CHECKS.INSIGHTS].includes(check.context)
    );

    return filteredChecks.length ? { ...statusChecks, checks: filteredChecks } : null;
  }

  _getEnforceAdmins(protectionSettingsData) {
    return protectionSettingsData.enforce_admins?.enabled ?? null;
  }

  _getRestrictions(protectionSettingsData) {
    const restrictions = protectionSettingsData.restrictions;
    if (!restrictions) return null;

    return {
      users: restrictions.users?.map(user => user.login) || [],
      teams: restrictions.teams?.map(team => team.slug) || []
    };
  }
}

module.exports = { GitHubClient };

const { GitHubClient } = require('../GitHubClient');
const winston = require("winston");

jest.mock('@octokit/rest');
jest.mock('winston');

describe('GitHubClient', () => {
  let client;
  const token = 'ghp_testtoken';

  beforeEach(() => {
    Octokit.mockClear();
    client = new GitHubClient(token);
  });

  test('validateToken should return valid true for valid token', async () => {
    Octokit.prototype.users = {
      getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'testuser' } })
    };

    const result = await client.validateToken();
    expect(result).toEqual({ valid: true, user: 'testuser' });
    expect(winston.createLogger().info).toHaveBeenCalledWith('✅ Token validated successfully for user: testuser');
  });

  test('validateToken should return valid false for invalid token', async () => {
    Octokit.prototype.users = {
      getAuthenticated: jest.fn().mockRejectedValue({ status: 401 })
    };

    const result = await client.validateToken();
    expect(result).toEqual({ valid: false, error: 'Invalid or expired GitHub token' });
    expect(winston.createLogger().warn).toHaveBeenCalledWith('⚠️ Invalid GitHub token provided');
  });
});
