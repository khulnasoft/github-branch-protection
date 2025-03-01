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

const logger = require('../utils/logger');
const KHULNASOFT_CHECKS = require('./KhulnasoftChecks');

/**
 * Manages branch protection settings for GitHub repositories
 */
class BranchProtectionManager {
  constructor(githubClient) {
    this.client = githubClient;
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
   * @returns {Promise<Object>} Result of the operation
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

      await this.client.client.repos.updateBranchProtection({
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

      const removedChecks = checksToRemove.length ? checksToRemove : [KHULNASOFT_CHECKS.POLICY, KHULNASOFT_CHECKS.INSIGHTS];
      const remainingChecks = statusChecks?.checks?.filter(
        check => !removedChecks.includes(check.context)
      ).map(check => check.context) || [];

      const checkNames = checksToRemove.length ? checksToRemove.join(', ') : 'Khulnasoft checks';
      logger.info(`✅ Removed ${checkNames} from branch protection for ${repositoryName}/${branch}`);
      
      return {
        message: `Removed ${checkNames} from branch protection`,
        removedChecks,
        remainingChecks
      };
    } catch (error) {
      logger.error(`❌ Failed to remove checks from ${repositoryName}/${branch}:`, error);
      throw error;
    }
  }

  /**
   * Remove specifically Khulnasoft checks from branch protection
   * @param {object} params - Parameters object
   * @param {string} params.owner - Owner of the repository
   * @param {string} params.repositoryName - Name of the repository
   * @param {string} params.branch - Branch name
   * @returns {Promise<void>}
   */
  async removeKhulnasoftChecksFromBranchProtection({ owner, repositoryName, branch }) {
    return this.removeChecksFromBranchProtection({ 
      owner, 
      repositoryName, 
      branch, 
      checksToRemove: [KHULNASOFT_CHECKS.POLICY, KHULNASOFT_CHECKS.INSIGHTS] 
    });
  }

  /**
   * Internal method to get branch protection settings
   * @param {object} params - Parameters object
   * @param {string} params.owner - Owner of the repository
   * @param {string} params.repositoryName - Name of the repository
   * @param {string} params.branch - Branch name
   * @returns {Promise<Object|undefined>} Branch protection settings or undefined if not found
   */
  async _getBranchProtection({ owner, repositoryName, branch }) {
    try {
      const { data } = await this.client.client.repos.getBranchProtection({ 
        owner, 
        repo: repositoryName, 
        branch 
      });
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

  /**
   * Extracts enforce_admins setting from protection settings
   * @param {Object} protectionSettingsData - Branch protection settings
   * @returns {boolean|null} enforce_admins setting
   */
  _getEnforceAdmins(protectionSettingsData) {
    return protectionSettingsData.enforce_admins?.enabled ?? null;
  }

  /**
   * Extracts restrictions settings from protection settings
   * @param {Object} protectionSettingsData - Branch protection settings
   * @returns {Object|null} restrictions setting
   */
  _getRestrictions(protectionSettingsData) {
    const restrictions = protectionSettingsData.restrictions;
    if (!restrictions) return null;

    return {
      users: restrictions.users?.map(user => user.login) || [],
      teams: restrictions.teams?.map(team => team.slug) || []
    };
  }
}

module.exports = BranchProtectionManager;

