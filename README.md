# 🚀 GitHub Branch Protection Updater

![GitHub repo size](https://img.shields.io/github/repo-size/khulnasoft/github-branch-protection?color=blue&label=Repo%20Size)
![GitHub issues](https://img.shields.io/github/issues/khulnasoft/github-branch-protection)
![GitHub last commit](https://img.shields.io/github/last-commit/khulnasoft/github-branch-protection)

> **A Node.js script to remove Khulnasoft-specific checks from GitHub branch protection settings in multiple repositories.**

## 🎯 Features
✅ Remove **Khulnasoft Smart Policy** and **Khulnasoft Insights** checks from protected branches  
✅ Batch process **all repositories** under a GitHub organization  
✅ Works with **private & public** repositories  
✅ Fully **automated** & **error-handled** execution  
✅ **Logs** all operations for debugging

## 📌 Prerequisites
Ensure you have the following installed:
- **Node.js** (>= 16.x recommended)
- **npm** (or yarn)
- A **GitHub Personal Access Token (PAT)** with `admin:repo_hook` & `repo` scopes

## 🚀 Installation & Setup

### 1️⃣ Clone the repository
```sh
 git clone https://github.com/khulnasoft/github-branch-protection.git
 cd github-branch-protection
```

### 2️⃣ Install dependencies
```sh
npm install
```

### 3️⃣ Configure environment variables
Create a `.env` file and add:
```sh
TOKEN=your_github_pat
OWNER=your_organization_name
```

## 📜 Usage
Run the script with:
```sh
node index.js
```
It will:
1. Fetch all repositories under the organization
2. Identify protected branches
3. Remove Khulnasoft-specific checks

### 🎥 Example Output
```sh
📦 Retrieved 12 repositories for khulnasoft
✅ Removed Khulnasoft checks from repo1/main
✅ Removed Khulnasoft checks from repo2/develop
Process completed. Updated 10 out of 12 repositories.
```

## 📊 Infographics
### 🎯 How It Works
```
  ┌───────────────┐        ┌──────────────────┐        ┌─────────────────────────┐
  │ GitHub Repos  │ -----> │ Fetch Protection │ -----> │ Remove Khulnasoft Checks │
  └───────────────┘        └──────────────────┘        └─────────────────────────┘
```

## 🛠 Contributing
Contributions are welcome! 🚀
1. Fork the repository
2. Create a new branch: `git checkout -b feature-branch`
3. Commit your changes: `git commit -m 'Add new feature'`
4. Push to the branch: `git push origin feature-branch`
5. Open a pull request

## 📜 License
ISC License © [Khulnasoft](https://github.com/khulnasoft)

---
🚀 **Maintained by [Khulnasoft](https://github.com/khulnasoft)**
