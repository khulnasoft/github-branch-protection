const { GithubClient } = require("./GithubClient");

const TOKEN = process.env.TOKEN;
const OWNER = process.env.OWNER;

if (!TOKEN || !OWNER) {
  console.error("❌ Error: Missing required environment variables TOKEN or OWNER.");
  process.exit(1);
}

async function listRepositories(client, owner) {
  try {
    const repos = await client.listRepositories(owner);
    if (!repos || repos.length === 0) {
      console.log("⚠️ No repositories found.");
      return [];
    }

    console.log(`📦 Retrieved ${repos.length} repositories.`);
    return repos;
  } catch (error) {
    console.error("❌ Failed to list repositories:", error);
    return []; // Prevents undefined errors
  }
}

async function updateBranchProtection(client, owner, repos) {
  let updatedRepos = 0;

  for (const repo of repos) {
    try {
      await client.removeDatreeChecksFromBranchProtection({
        owner: owner,
        repositoryName: repo.name,
        branch: repo.defaultBranch,
      });

      updatedRepos += 1;
      console.log(`✅ [${updatedRepos}/${repos.length}] Removed Datree checks from: ${repo.name}`);
    } catch (error) {
      console.error(`❌ Failed to update ${repo.name}:`, error);
    }
  }

  return updatedRepos;
}

async function run() {
  const githubClient = new GithubClient(TOKEN);

  try {
    const repos = await listRepositories(githubClient, OWNER);
    if (repos.length === 0) return;

    const updatedRepos = await updateBranchProtection(githubClient, OWNER, repos);

    console.log(`🎉 Process completed. Updated ${updatedRepos} out of ${repos.length} repositories.`);
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

run();
