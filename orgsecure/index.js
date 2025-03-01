name: CI/CD Pipeline

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  schedule:
    - cron: '0 0 * * 0' # Runs every Sunday at midnight

jobs:
  dependabot:
    name: Dependabot
    runs-on: ubuntu-latest
    steps:
      - name: Check for Dependabot updates
        uses: dependabot/dependabot-core@v2
        with:
          package-manager: 'npm' # Change to your package manager (e.g., 'npm', 'bundler', etc.)
          directory: '/' # Change to your project directory if needed
          schedule: 'daily' # Change to your preferred schedule

  test:
    name: Run Tests
    runs-on: ubuntu-latest
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
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Setup CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: 'javascript' # Change to your project's language(s)
          # If you want to specify a custom CodeQL database, uncomment the following line
          # database: 'path/to/database'

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2

  security-checks:
    name: Security Checks
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Run security checks
        run: |
          npm install -g npm audit
          npm audit