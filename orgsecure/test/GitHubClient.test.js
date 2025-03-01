name: CI Workflow

on:
  push:
    branches:
      - main
      - 'feature/**'
  pull_request:
    branches:
      - main
  schedule:
    - cron: '0 0 * * 0' # Runs every Sunday at midnight

jobs:
  dependabot:
    name: Dependabot Check
    runs-on: ubuntu-latest
    steps:
      - name: Check for Dependabot updates
        uses: dependabot/fetch-metadata@v1
        with:
          package-ecosystem: 'npm' # Change this to your package manager (npm, pip, etc.)
          directory: '/' # Change this to your project directory if needed
          schedule: 'daily'

  test:
    name: Run Tests
    runs-on: ubuntu-latest
    needs: dependabot
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Set up Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '14' # Change to your required Node.js version

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

  codeql:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: 'javascript' # Change to your project's language

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2

  security-checks:
    name: Security Checks
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Run security checks
        run: |
          npm audit --production # Change this command based on your package manager