#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Mint Clone — Azure Infrastructure Provisioning (Cost-Optimized)
#
# Optimized for single-user / personal use:
#   - App Service F1 free tier (upgrade to B1 when needed)
#   - PostgreSQL Burstable B1ms (~$12/mo, stop when not in use → ~$5-8/mo)
#   - Key Vault standard (essentially free)
#   - Budget alert at $15/mo
#   - Resource tags for cost tracking
#
# Estimated monthly cost: $5-12 (depends on DB uptime)
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Subscription selected (az account set -s <sub-id>)
#
# Usage:
#   chmod +x infra/provision.sh
#   ./infra/provision.sh
# =============================================================================

# --- Configuration (edit these) ---
RESOURCE_GROUP="rg-mint-clone"
LOCATION="eastus"
APP_NAME="mint-clone-app"
DB_SERVER_NAME="mint-clone-db"
DB_NAME="mint_clone"
DB_ADMIN_USER="mintadmin"
DB_ADMIN_PASSWORD="$(openssl rand -base64 24)"
KEYVAULT_NAME="kv-mint-clone"
APP_SERVICE_PLAN="asp-mint-clone"
BUDGET_ALERT_EMAIL=""  # <-- Set your email for cost alerts

# --- Cost-optimized SKUs ---
SKU_DB="B_Standard_B1ms"      # Burstable: 1 vCore, 2GB RAM (~$12/mo full-time)
SKU_APP="F1"                   # Free tier: 60 CPU min/day, 1GB RAM, no custom domain
                               # Upgrade: az appservice plan update -g $RESOURCE_GROUP -n $APP_SERVICE_PLAN --sku B1

echo "=== Mint Clone Azure Provisioning (Cost-Optimized) ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo "App Tier:       F1 (free)"
echo "DB Tier:        Burstable B1ms"
echo ""

# 1. Resource Group with cost-tracking tags
echo "[1/6] Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags project=mint-clone environment=production owner=personal \
  --output none

# 2. PostgreSQL Flexible Server
echo "[2/6] Creating PostgreSQL server (this takes 2-5 minutes)..."
az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_SERVER_NAME" \
  --location "$LOCATION" \
  --admin-user "$DB_ADMIN_USER" \
  --admin-password "$DB_ADMIN_PASSWORD" \
  --sku-name "$SKU_DB" \
  --tier "Burstable" \
  --storage-size 32 \
  --version 16 \
  --public-access "0.0.0.0" \
  --yes \
  --output none

# Create the database
az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$DB_SERVER_NAME" \
  --database-name "$DB_NAME" \
  --output none

DB_HOST="${DB_SERVER_NAME}.postgres.database.azure.com"
DATABASE_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${DB_HOST}:5432/${DB_NAME}?sslmode=require"

# 3. Key Vault
echo "[3/6] Creating Key Vault..."
az keyvault create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$KEYVAULT_NAME" \
  --location "$LOCATION" \
  --output none

# Store secrets in Key Vault
JWT_SECRET="$(openssl rand -base64 48)"
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "DATABASE-URL" --value "$DATABASE_URL" --output none
az keyvault secret set --vault-name "$KEYVAULT_NAME" --name "JWT-SECRET" --value "$JWT_SECRET" --output none
echo "  Secrets stored: DATABASE-URL, JWT-SECRET"
echo "  Add PLAID and ANTHROPIC keys manually:"
echo "    az keyvault secret set --vault-name $KEYVAULT_NAME --name PLAID-CLIENT-ID --value <your-id>"
echo "    az keyvault secret set --vault-name $KEYVAULT_NAME --name PLAID-SECRET --value <your-secret>"
echo "    az keyvault secret set --vault-name $KEYVAULT_NAME --name ANTHROPIC-API-KEY --value <your-key>"

# 4. App Service (Free tier)
echo "[4/6] Creating App Service (F1 free tier)..."
az appservice plan create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_PLAN" \
  --sku "$SKU_APP" \
  --is-linux \
  --output none

az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --name "$APP_NAME" \
  --runtime "NODE:20-lts" \
  --output none

# Enable managed identity for Key Vault access
echo "[5/6] Configuring App Service..."
az webapp identity assign \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --output none

PRINCIPAL_ID=$(az webapp identity show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" --query principalId -o tsv)

# Grant App Service access to Key Vault secrets
az keyvault set-policy \
  --name "$KEYVAULT_NAME" \
  --object-id "$PRINCIPAL_ID" \
  --secret-permissions get list \
  --output none

# Configure app settings with Key Vault references
az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --settings \
    "DATABASE_URL=@Microsoft.KeyVault(VaultName=${KEYVAULT_NAME};SecretName=DATABASE-URL)" \
    "JWT_SECRET=@Microsoft.KeyVault(VaultName=${KEYVAULT_NAME};SecretName=JWT-SECRET)" \
    "NODE_ENV=production" \
    "PORT=8080" \
    "WEBSITE_NODE_DEFAULT_VERSION=~20" \
  --output none

# Set startup command
az webapp config set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --startup-file "node server/dist/index.js" \
  --output none

# 6. Budget alert
echo "[6/6] Creating budget alert..."
if [ -n "$BUDGET_ALERT_EMAIL" ]; then
  SUBSCRIPTION_ID=$(az account show --query id -o tsv)
  az consumption budget create \
    --budget-name "mint-clone-budget" \
    --amount 15 \
    --category Cost \
    --time-grain Monthly \
    --start-date "$(date -u +%Y-%m-01)" \
    --end-date "2027-12-31" \
    --resource-group "$RESOURCE_GROUP" \
    --notifications \
      '{
        "actual_80_percent": {
          "enabled": true,
          "operator": "GreaterThanOrEqualTo",
          "threshold": 80,
          "contactEmails": ["'"$BUDGET_ALERT_EMAIL"'"]
        },
        "actual_100_percent": {
          "enabled": true,
          "operator": "GreaterThanOrEqualTo",
          "threshold": 100,
          "contactEmails": ["'"$BUDGET_ALERT_EMAIL"'"]
        }
      }' \
    --output none 2>/dev/null && echo "  Budget alert: email at 80% and 100% of \$15/mo" \
    || echo "  Budget alert: skipped (may require Cost Management API registration)"
else
  echo "  Skipped — set BUDGET_ALERT_EMAIL in this script to enable"
fi

echo ""
echo "=== Provisioning Complete ==="
echo ""
echo "App URL:       https://${APP_NAME}.azurewebsites.net"
echo "DB Host:       $DB_HOST"
echo "DB Password:   $DB_ADMIN_PASSWORD  (saved in Key Vault)"
echo "JWT Secret:    (saved in Key Vault)"
echo "Key Vault:     $KEYVAULT_NAME"
echo ""
echo "=== Cost Summary ==="
echo "  App Service (F1):  FREE  (60 CPU min/day — fine for 1 user)"
echo "  PostgreSQL (B1ms): ~\$12/mo full-time, ~\$5-8/mo if stopped overnight"
echo "  Key Vault:         ~\$0 (pennies per 10k operations)"
echo "  Total estimate:    \$5-12/mo"
echo ""
echo "=== Cost Management Commands ==="
echo "  Stop DB (saves ~40%):   az postgres flexible-server stop -g $RESOURCE_GROUP -n $DB_SERVER_NAME"
echo "  Start DB:               az postgres flexible-server start -g $RESOURCE_GROUP -n $DB_SERVER_NAME"
echo "  Upgrade to B1 app:      az appservice plan update -g $RESOURCE_GROUP -n $APP_SERVICE_PLAN --sku B1"
echo "  Downgrade to free:      az appservice plan update -g $RESOURCE_GROUP -n $APP_SERVICE_PLAN --sku F1"
echo "  View current costs:     az cost management query ... (or use Azure Portal > Cost Analysis)"
echo "  Destroy everything:     az group delete -n $RESOURCE_GROUP --yes --no-wait"
echo ""
