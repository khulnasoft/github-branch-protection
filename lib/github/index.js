const GitHubClient = require('./GitHubClient');
const BranchProtectionManager = require('./BranchProtectionManager');
const KHULNASOFT_CHECKS = require('./KhulnasoftChecks');

/**
 * Creates a GitHub API instance with both the raw client and the branch protection manager
 * @param {string} token - GitHub API token
 * @returns {Object} GitHub API instance with client and branch protection manager
 */
function createGithubAPI(token) {
  if (!token) {
    throw new Error('GitHub token is required');
  }

  // Create the GitHub client instance
  const client = new GitHubClient(token);
  
  // Create the branch protection manager using the client
  const branchProtectionManager = new BranchProtectionManager(client);
  
  // Return an object with both instances
  return {
    client,
    branchProtectionManager
  };
}

module.exports = {
  createGithubAPI,
  GitHubClient,
  BranchProtectionManager,
  KHULNASOFT_CHECKS
};
