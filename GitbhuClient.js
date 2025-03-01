const { Octokit } = require("@octokit/rest");
const getProperty = require("lodash.get");
const winston = require("winston");

const KHULNASOFT_CHECKS = {
  POLICY: "Khulnasoft Smart Policy",
  INSIGHTS: "Khulnasoft Insights"
};

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "github-client.log" })
  ]
});

class GithubClient {
  constructor(token) {
    this.client = new Octokit({
      auth: token
    });
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
      const repos = await this._paginate(() => this.client.repos.listForOrg({ org, per_page: 100 }));
      if (!repos.length) {
        logger.warn(`⚠️ No repositories found for organization: ${org}`);
      } else {
        logger.info(`📦 Retrieved ${repos.length} repositories for ${org}`);
      }

      return repos.map(repo => ({
        url: repo.html_url,
        private: repo.private,
        forked: repo.fork,
        archived: repo.archived,
        owner: repo.owner.login,
        name: repo.name,
        id: repo.id,
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

module.exports = { GithubClient };
