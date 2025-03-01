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

// Import core modules
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Import application modules
const { createGithubAPI, KHULNASOFT_CHECKS } = require('./lib/github/index');
const logger = require('./lib/utils/logger');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('token', {
    type: 'string',
    description: 'GitHub token',
    alias: 't'
  })
  .option('owner', {
    type: 'string',
    description: 'GitHub owner (organization or user)',
    alias: 'o'
  })
  .option('repo', {
    type: 'string',
    description: 'Specific repository to process (optional)',
    alias: 'r'
  })
  .option('branch', {
    type: 'string',
    description: 'Branch to modify (defaults to repository default branch)',
    alias: 'b'
  })
  .option('dry-run', {
    type: 'boolean',
    description: 'Simulate changes without applying them',
    default: false,
    alias: 'd'
  })
  .option('checks', {
    type: 'array',
    description: 'Custom checks to remove (defaults to Khulnasoft checks)',
    alias: 'c'
  })
  .option('concurrency', {
    type: 'number',
    description: 'Maximum number of concurrent operations',
    default: 5,
    alias: 'n'
  })
  .option('report', {
    type: 'string',
    description: 'Generate a report file (specify filename)',
    alias: 'p'
  })
  .option('verbose', {
    type: 'boolean',
    description: 'Enable verbose logging',
    default: false,
    alias: 'v'
  })
  
  .example('$0 --owner myorg --dry-run', 'Simulate changes for all repositories in myorg')
  .example('$0 --owner myorg --repo myrepo --checks "CI Build" "Lint"', 'Remove specific checks from myrepo')
  .example('$0 --owner myorg --report changes.json', 'Process all repos and save report to changes.json')
  .help()
  .alias('help', 'h')
  .epilogue('For more information, check the README.md')
  .argv;

// Configuration constants
const TOKEN = argv.token || process.env.TOKEN;
const OWNER = argv.owner || process.env.OWNER;
const SPECIFIC_REPO = argv.repo || null;
const SPECIFIC_BRANCH = argv.branch || null;
const DRY_RUN = argv.dryRun || false;
const CUSTOM_CHECKS = argv.checks || null;
const MAX_CONCURRENCY = argv.concurrency || 5;  // Maximum number of concurrent operations
const THROTTLE_DELAY = 1000;  // Delay between API calls in milliseconds
const MAX_RETRIES = 5; // Maximum number of retry attempts
const INITIAL_BACKOFF_DELAY = 1000; // Initial backoff delay in milliseconds
const REPORT_FILE = argv.report || null;
const VERBOSE = argv.verbose || false;

// Configure logger with verbose setting
logger.setVerbose(VERBOSE);

/**
 * Validates environment variables
 * @returns {boolean} - true if all required env vars are valid
 */
function validateEnvironmentVariables() {
  // Check for presence of required variables
  if (!TOKEN) {
    logger.error("❌ Error: Missing GitHub token. Provide it via --token option or TOKEN environment variable.");
    return false;
  }
  
  if (!OWNER) {
    logger.error("❌ Error: Missing GitHub owner. Provide it via --owner option or OWNER environment variable.");
    return false;
  }
  
  // Validate TOKEN format (should be a GitHub personal access token)
  if (!/^ghp_[a-zA-Z0-9]{36}$/.test(TOKEN) && 
      !/^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/.test(TOKEN)) {
    logger.error("❌ Error: GitHub token appears to be invalid. It should be a GitHub personal access token.");
    return false;
  }
  
  // Validate OWNER format (GitHub username or organization name)
  if (!/^[a-zA-Z0-9][-a-zA-Z0-9]*$/.test(OWNER)) {
    logger.error("❌ Error: Owner appears to be invalid. It should be a valid GitHub username or organization name.");
    return false;
  }
  
  // If specific repo is provided, validate it
  if (SPECIFIC_REPO && !/^[a-zA-Z0-9._-]+$/.test(SPECIFIC_REPO)) {
    logger.error("❌ Error: Repository name appears to be invalid.");
    return false;
  }
  
  return true;
}

// Validate environment variables before proceeding
if (!validateEnvironmentVariables()) {
  process.exit(1);
}

/**
 * List repositories to process based on input parameters
 * @param {Object} client - GitHubClient instance
 * @param {string} owner - Repository owner
 * @returns {Promise<Array>} - Array of repository objects
 */
async function listRepositories(client, owner) {
  try {
    // If a specific repository is provided, fetch just that one
    if (SPECIFIC_REPO) {
      try {
        const repo = await client.getRepository(owner, SPECIFIC_REPO);
        logger.info(`\U0001F4E6 Retrieved repository: ${SPECIFIC_REPO}`);
        return [repo];
      } catch (error) {
        logger.warn(`⚠️ Repository ${SPECIFIC_REPO} not found.`);
        return [];
      }
    }
    
    // Otherwise, fetch all repositories for the owner
    const repos = await client.listRepositories(owner);
    if (!repos || repos.length === 0) {
      logger.warn("No repositories found.");
      return [];
    }

    logger.info(`\U0001F4E6 Retrieved ${repos.length} repositories.`);
    return repos;
  } catch (error) {
    logger.error("Failed to list repositories:", error);
    return []; // Prevents undefined errors
  }
}

/**
 * Delays execution for the given number of milliseconds
 * @param {number} ms - milliseconds to delay
 * @returns {Promise} - resolves after the delay
 */
/**
 * Delays execution for the given number of milliseconds
 * @param {number} ms - milliseconds to delay
 * @returns {Promise} - resolves after the delay
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Implements exponential backoff for retries
 * @param {Function} fn - Function to execute with retries
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds
 * @returns {Promise<any>} - Result of the function
 */
async function withExponentialBackoff(fn, maxRetries = MAX_RETRIES, initialDelay = INITIAL_BACKOFF_DELAY) {
  let retries = 0;
  let lastError;

  while (retries <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is due to rate limiting
      if (error.response?.headers?.['x-ratelimit-reset']) {
        const resetTime = error.response.headers['x-ratelimit-reset'];
        const waitTime = (new Date(resetTime * 1000) - new Date()) + 1000; // Add a buffer of 1 second
        logger.warn(`⚠️ Rate limit hit. Waiting until reset: ${new Date(resetTime * 1000).toLocaleTimeString()}`);
        await delay(waitTime > 0 ? waitTime : 60000); // Fallback to 1 minute if waitTime is negative
      } else if (error.status === 403 && error.message?.includes('rate limit')) {
        // Rate limit error without reset time in headers
        const backoffDelay = initialDelay * Math.pow(2, retries);
        logger.warn(`Rate limit hit. Backing off for ${backoffDelay / 1000} seconds`);
        await delay(backoffDelay);
      } else if (error.status === 502 || error.status === 503 || error.status === 504) {
        // GitHub API transient errors
        const backoffDelay = initialDelay * Math.pow(2, retries);
        logger.warn(`GitHub API error ${error.status}. Backing off for ${backoffDelay / 1000} seconds`);
        await delay(backoffDelay);
      } else {
        // Not a retryable error
        throw error;
      }
      
      retries++;
      if (retries > maxRetries) {
        logger.error(`Maximum retries (${maxRetries}) exceeded`);
        throw lastError;
      }
    }
  }
}

/**
 * Process a single repository with throttling and retries
 * @param {Object} client - GitHubClient instance
 * @param {string} owner - Repository owner
 * @param {Object} repo - Repository object
 * @param {number} index - Current repository index
 * @param {number} total - Total number of repositories
 * @returns {Promise<boolean>} - true if successful, false otherwise
 */
/**
 * Process a single repository with throttling and retries
 * @param {Object} client - GitHubClient instance
 * @param {Object} branchProtectionManager - BranchProtectionManager instance
 * @param {string} owner - Repository owner
 * @param {Object} repo - Repository object
 * @param {number} index - Current repository index
 * @param {number} total - Total number of repositories
 * @param {Array} reportData - Array to collect report data
 * @returns {Promise<boolean>} - true if successful, false otherwise
 */
async function processRepository(client, branchProtectionManager, owner, repo, index, total, reportData) {
  try {
    // Add a small delay to avoid hitting rate limits
    await delay(THROTTLE_DELAY);
    
    // Determine which branch to update
    const branchToUpdate = SPECIFIC_BRANCH || repo.defaultBranch;
    
    if (VERBOSE) {
      logger.debug(`\U0001F50D Checking branch protection for ${repo.name}/${branchToUpdate}...`);
    }
    
    // Get current branch protection before changes
    const protectionBefore = await withExponentialBackoff(async () => {
      return await branchProtectionManager.getBranchProtection({
        owner: owner,
        repositoryName: repo.name,
        branch: branchToUpdate,
      });
    });
    
    // If no protection exists, log and continue
    if (!protectionBefore) {
      const message = `\U0001F6AB No branch protection found for ${repo.name}/${branchToUpdate}`;
      logger.info(message);
      
      // Add to report
      if (reportData) {
        reportData.push({
          repository: repo.name,
          branch: branchToUpdate,
          status: 'skipped',
          reason: 'No branch protection found',
          changes: []
        });
      }
      
      return true;
    }
    
    // Get the checks to remove
    const checksToRemove = CUSTOM_CHECKS || null; // null means use default Khulnasoft checks
    
    // If it's a dry run, don't apply changes
    if (DRY_RUN) {
      const changes = await branchProtectionManager.simulateRemovingChecks({
        owner,
        repositoryName: repo.name,
        branch: branchToUpdate,
        checksToRemove
      });
      
      if (changes.modified) {
        logger.info(`\U0001F4DD [DRY RUN] [${index + 1}/${total}] Would remove checks from: ${repo.name}/${branchToUpdate}`);
        if (VERBOSE) {
          logger.debug('Checks that would be removed:');
          changes.removedChecks.forEach(check => logger.debug(`  - ${check}`));
        }
      } else {
        logger.info(`\U0001F4DD [DRY RUN] [${index + 1}/${total}] No checks to remove from: ${repo.name}/${branchToUpdate}`);
      }
      
      // Add to report
      if (reportData) {
        reportData.push({
          repository: repo.name,
          branch: branchToUpdate,
          status: 'simulated',
          dryRun: true,
          changes: changes.removedChecks,
          checksRemaining: changes.remainingChecks
        });
      }
      
      return true;
    }
    
    // Actually apply the changes
    // Actually apply the changes
    await withExponentialBackoff(async () => {
      const result = await branchProtectionManager.removeChecksFromBranchProtection({
        owner: owner,
        repositoryName: repo.name,
        branch: branchToUpdate,
        checksToRemove: checksToRemove
      });
      // Add to report
      if (reportData) {
        reportData.push({
          repository: repo.name,
          branch: branchToUpdate,
          status: 'updated',
          changes: result.removedChecks,
          checksRemaining: result.remainingChecks
        });
      }
      
      return result;
    });
    
    logger.info(`✅ [${index + 1}/${total}] Removed checks from: ${repo.name}/${branchToUpdate}`);
    return true;
  } catch (error) {
    // Sanitize any potentially sensitive information from error logs
    const sanitizedError = sanitizeErrorForLogging(error);
    logger.error(`❌ Failed to update ${repo.name}:`, sanitizedError);
    
    // Add to report
    if (reportData) {
      reportData.push({
        repository: repo.name,
        branch: SPECIFIC_BRANCH || repo.defaultBranch,
        status: 'error',
        error: sanitizedError.message || 'Unknown error'
      });
    }
    
    return false;
  }
}

/**
 * Sanitizes error objects to remove sensitive information before logging
 * @param {Error} error - The error object to sanitize
 * @returns {Object} - A sanitized version of the error
 */
function sanitizeErrorForLogging(error) {
  if (!error) return 'Unknown error';
  
  // Create a new object with only safe properties
  const sanitized = {
    name: error.name,
    message: error.message,
    status: error.status,
    code: error.code
  };
  
  // Remove any tokens or secrets from error message
  if (sanitized.message) {
    sanitized.message = sanitized.message
      .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
      .replace(/github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, '[REDACTED_TOKEN]')
      .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]')
      .replace(/Authorization: [a-zA-Z0-9._-]+/g, 'Authorization: [REDACTED]');
  }
  
  return sanitized;
}
/**
 * Process repositories in batches with controlled concurrency
 * @param {Object} client - GitHubClient instance
 * @param {string} owner - Repository owner
 * @param {Array} repos - Array of repository objects
 * @returns {Promise<number>} - Number of successfully updated repositories
 */
async function updateBranchProtection(github, owner, repos, reportData = null) {
  let updatedRepos = 0;
  
  // Process repositories in batches of MAX_CONCURRENCY
  for (let i = 0; i < repos.length; i += MAX_CONCURRENCY) {
    const batch = repos.slice(i, i + MAX_CONCURRENCY);
    
    // Create an array of promises for the current batch
    const promises = batch.map((repo, batchIndex) => 
      processRepository(github.client, github.branchProtectionManager, owner, repo, i + batchIndex, repos.length, reportData)
    );
    
    // Process the current batch in parallel
    const results = await Promise.all(promises);
    
    // Count successful updates
    updatedRepos += results.filter(result => result).length;
    
    // Add delay between batches to avoid rate limits
    if (i + MAX_CONCURRENCY < repos.length) {
      logger.info(`\U0001F552 Waiting before processing next batch...`);
      await delay(THROTTLE_DELAY * 2);
    }
  }
  
  return updatedRepos;
}
/**
 * Validates GitHub token by making a simple API call
 * @param {Object} client - GitHubClient instance
 * @returns {Promise<boolean>} - true if token is valid
 */
async function validateToken(client) {
  try {
    const result = await client.validateToken();
    if (result.valid) {
      logger.info("✅ GitHub token validated successfully");
      return true;
    } else {
      logger.error("❌ Invalid GitHub token:", result.error);
      return false;
    }
  } catch (error) {
    logger.error("❌ Invalid GitHub token:", sanitizeErrorForLogging(error));
    return false;
  }
}

async function run() {
  // Initialize GitHub API with factory function
  const github = createGithubAPI(TOKEN);
  // Initialize report data array if reporting is enabled
  const reportData = REPORT_FILE ? [] : null;

  try {
    // Validate the GitHub token before proceeding
    const isTokenValid = await validateToken(github.client);
    if (!isTokenValid) {
      logger.error("❌ Cannot proceed with an invalid GitHub token");
      process.exit(1);
    }

    const repos = await listRepositories(github.client, OWNER);
    if (repos.length === 0) {
      logger.warn("⚠️ No repositories to process");
      return;
    }

    // Validate input before processing
    const validRepos = repos.filter(repo => {
      if (!repo.name || !repo.defaultBranch) {
        logger.warn(`⚠️ Skipping repository with missing name or default branch: ${JSON.stringify(repo)}`);
        return false;
      }
      return true;
    });

    const updatedRepos = await updateBranchProtection(github, OWNER, validRepos, reportData);

    logger.info(`\U0001F389 Process completed. Updated ${updatedRepos} out of ${validRepos.length} repositories.`);
    
    // Generate report file if specified
    if (REPORT_FILE && reportData) {
      try {
        // Create report object with metadata
        const report = {
          generated: new Date().toISOString(),
          owner: OWNER,
          specificRepo: SPECIFIC_REPO,
          specificBranch: SPECIFIC_BRANCH,
          dryRun: DRY_RUN,
          customChecks: CUSTOM_CHECKS,
          summary: {
            totalRepositories: validRepos.length,
            repositoriesUpdated: updatedRepos,
            repositoriesWithErrors: reportData.filter(r => r.status === 'error').length,
            repositoriesSkipped: reportData.filter(r => r.status === 'skipped').length
          },
          details: reportData
        };
        
        // Ensure directory exists
        const reportDir = path.dirname(REPORT_FILE);
        if (reportDir !== '.' && !fs.existsSync(reportDir)) {
          fs.mkdirSync(reportDir, { recursive: true });
        }
        
        // Write report to file
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
        logger.info(`\U0001F4BE Report saved to ${REPORT_FILE}`);
      } catch (error) {
        logger.error(`❌ Failed to write report to ${REPORT_FILE}:`, sanitizeErrorForLogging(error));
      }
    }
  } catch (error) {
    // Sanitize any potentially sensitive information before logging
    const sanitizedError = sanitizeErrorForLogging(error);
    logger.error("❌ Unexpected error:", sanitizedError);
    process.exit(1);
  }
}

run();
