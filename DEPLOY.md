# Mint Clone — Deployment Guide

Step-by-step instructions to deploy the app to Azure. Estimated time: 30-45 minutes.

**Monthly cost**: $5-12 (PostgreSQL only — App Service is free tier)

---

## Prerequisites

You need three things before starting:

### 1. Azure Account + Subscription

If you don't have one:
1. Go to https://azure.microsoft.com/free
2. Create a free account (you get $200 credit for 30 days)
3. A subscription is created automatically

### 2. Azure CLI

Install the Azure command-line tool:

**Windows** (run in PowerShell as Admin):
```powershell
winget install Microsoft.AzureCLI
```

**Mac**:
```bash
brew install azure-cli
```

After installing, restart your terminal, then log in:
```bash
az login
```
This opens a browser — sign in with your Azure account. When done, the terminal shows your subscription info.

If you have multiple subscriptions, select the right one:
```bash
az account list --output table
az account set --subscription "Your Subscription Name"
```

### 3. API Keys (get these now, you'll need them in Step 3)

**Plaid** (bank integration):
1. Go to https://dashboard.plaid.com/signup
2. Create a free account
3. Go to https://dashboard.plaid.com/developers/keys
4. Copy your **Client ID** and **Sandbox Secret**

**Anthropic** (AI categorization):
1. Go to https://console.anthropic.com
2. Create an account, add billing
3. Go to https://console.anthropic.com/settings/keys
4. Create a key, copy it

**Resend** (email notifications — optional):
1. Go to https://resend.com/signup
2. Create account, go to API Keys
3. Create a key, copy it

---

## Step 1: Create Azure Infrastructure

This script creates everything: database, web server, key vault, and budget alerts.

First, edit the script to set your email for cost alerts:
```bash
# Open infra/provision.sh in a text editor
# Find line 35:  BUDGET_ALERT_EMAIL=""
# Change to:     BUDGET_ALERT_EMAIL="your@email.com"
```

Then run it:
```bash
chmod +x infra/provision.sh
./infra/provision.sh
```

**This takes 3-5 minutes.** It will output something like:
```
=== Provisioning Complete ===

App URL:       https://mint-clone-app.azurewebsites.net
DB Host:       mint-clone-db.postgres.database.azure.com
DB Password:   <random-string>  (saved in Key Vault)
JWT Secret:    (saved in Key Vault)
Key Vault:     kv-mint-clone
```

**Save the output** — you'll need the App URL later.

The database password and JWT secret are automatically generated and stored securely in Azure Key Vault. You never need to manage them manually.

---

## Step 2: Verify Azure Resources

Check that everything was created:
```bash
az group show --name rg-mint-clone --output table
```

You should see the resource group in `eastus` with status `Succeeded`.

Check the web app is running:
```bash
az webapp show --name mint-clone-app --resource-group rg-mint-clone --query state -o tsv
```

Should output: `Running`

---

## Step 3: Add Your API Keys to Key Vault

These commands store your Plaid, Anthropic, and Resend keys securely. Replace the placeholder values with your actual keys.

```bash
# Plaid (required for bank integration)
az keyvault secret set \
  --vault-name kv-mint-clone \
  --name PLAID-CLIENT-ID \
  --value "your-plaid-client-id-here"

az keyvault secret set \
  --vault-name kv-mint-clone \
  --name PLAID-SECRET \
  --value "your-plaid-sandbox-secret-here"

# Anthropic (required for AI categorization)
az keyvault secret set \
  --vault-name kv-mint-clone \
  --name ANTHROPIC-API-KEY \
  --value "your-anthropic-api-key-here"

# Resend (optional — for email notifications)
az keyvault secret set \
  --vault-name kv-mint-clone \
  --name RESEND-API-KEY \
  --value "your-resend-api-key-here"
```

Then add Key Vault references to the App Service so the app can read them:
```bash
az webapp config appsettings set \
  --resource-group rg-mint-clone \
  --name mint-clone-app \
  --settings \
    "PLAID_CLIENT_ID=@Microsoft.KeyVault(VaultName=kv-mint-clone;SecretName=PLAID-CLIENT-ID)" \
    "PLAID_SECRET=@Microsoft.KeyVault(VaultName=kv-mint-clone;SecretName=PLAID-SECRET)" \
    "PLAID_ENV=sandbox" \
    "ANTHROPIC_API_KEY=@Microsoft.KeyVault(VaultName=kv-mint-clone;SecretName=ANTHROPIC-API-KEY)" \
    "RESEND_API_KEY=@Microsoft.KeyVault(VaultName=kv-mint-clone;SecretName=RESEND-API-KEY)" \
  --output none
```

---

## Step 4: Set Up GitHub Actions Deployment

This connects GitHub to Azure so every push to `master` automatically deploys.

### 4a. Get the Azure Publish Profile

```bash
az webapp deployment list-publishing-profiles \
  --name mint-clone-app \
  --resource-group rg-mint-clone \
  --xml
```

This prints a large XML block. **Copy the entire output** (starts with `<publishData>`, ends with `</publishData>`).

### 4b. Add It as a GitHub Secret

1. Go to your GitHub repo: https://github.com/Jimi-Ige/Mint-Clone
2. Click **Settings** (top menu bar)
3. Click **Secrets and variables** > **Actions** (left sidebar)
4. Click **New repository secret**
5. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
6. Value: Paste the entire XML from step 4a
7. Click **Add secret**

### 4c. Push the Workflow File

The deploy workflow file exists locally but may not be on GitHub yet (requires `workflow` OAuth scope):

```bash
# Grant GitHub CLI the workflow scope
gh auth refresh -h github.com -s workflow
```

This opens a browser — authorize it. Then push:
```bash
git push origin master
```

---

## Step 5: Deploy

Push any change to master to trigger deployment:
```bash
git add .
git commit -m "Trigger deployment"
git push origin master
```

Or trigger manually:
1. Go to https://github.com/Jimi-Ige/Mint-Clone/actions
2. Click "Deploy to Azure" workflow
3. Click "Run workflow" > "Run workflow"

**The deployment takes about 3-5 minutes.** You can watch progress in the Actions tab.

---

## Step 6: Verify the Deployment

### Check the health endpoint:
```bash
curl https://mint-clone-app.azurewebsites.net/api/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2026-03-27T..."}
```

### Open the app:
Go to **https://mint-clone-app.azurewebsites.net** in your browser.

You should see the login page. Create an account and you're live!

---

## Post-Deployment

### Switch Plaid from Sandbox to Production

When you're ready to connect real bank accounts:

1. Apply for Production access at https://dashboard.plaid.com
2. Once approved, update the secrets:
```bash
az keyvault secret set --vault-name kv-mint-clone --name PLAID-SECRET --value "your-production-secret"

az webapp config appsettings set \
  --resource-group rg-mint-clone \
  --name mint-clone-app \
  --settings "PLAID_ENV=production" \
  --output none

# Restart the app to pick up changes
az webapp restart --name mint-clone-app --resource-group rg-mint-clone
```

### Cost Management

```bash
# Stop the database overnight to save ~40% ($12/mo → ~$7/mo)
az postgres flexible-server stop -g rg-mint-clone -n mint-clone-db

# Start it back up
az postgres flexible-server start -g rg-mint-clone -n mint-clone-db

# Upgrade app to B1 if you need custom domain or more CPU ($13/mo)
az appservice plan update -g rg-mint-clone -n asp-mint-clone --sku B1

# Downgrade back to free
az appservice plan update -g rg-mint-clone -n asp-mint-clone --sku F1

# View current month's costs
az cost management query --type ActualCost --timeframe MonthToDate \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-mint-clone" \
  --output table 2>/dev/null || echo "Use Azure Portal > Cost Analysis for detailed breakdown"
```

### Destroy Everything (if you want to stop paying)

```bash
az group delete --name rg-mint-clone --yes --no-wait
```

This deletes the database, app, key vault, and all data permanently.

---

## Troubleshooting

### App won't start
```bash
# Check logs
az webapp log tail --name mint-clone-app --resource-group rg-mint-clone

# Check if env vars are set
az webapp config appsettings list --name mint-clone-app --resource-group rg-mint-clone --output table
```

### Database connection errors
```bash
# Check if DB is running
az postgres flexible-server show -g rg-mint-clone -n mint-clone-db --query state -o tsv

# If stopped, start it
az postgres flexible-server start -g rg-mint-clone -n mint-clone-db
```

### Key Vault access denied
```bash
# Check managed identity
az webapp identity show --name mint-clone-app --resource-group rg-mint-clone

# Re-grant access
PRINCIPAL_ID=$(az webapp identity show --resource-group rg-mint-clone --name mint-clone-app --query principalId -o tsv)
az keyvault set-policy --name kv-mint-clone --object-id "$PRINCIPAL_ID" --secret-permissions get list
```

### GitHub Actions failing
1. Go to https://github.com/Jimi-Ige/Mint-Clone/actions
2. Click the failed run
3. Expand the failing step to see the error
4. Common fix: check that `AZURE_WEBAPP_PUBLISH_PROFILE` secret is set correctly

### Force restart
```bash
az webapp restart --name mint-clone-app --resource-group rg-mint-clone
```
