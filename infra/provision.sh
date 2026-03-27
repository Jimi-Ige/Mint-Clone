#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Mint Clone — Azure Infrastructure Provisioning
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Subscription selected (az account set -s <sub-id>)
#
# Usage:
#   chmod +x infra/provision.sh
#   ./infra/provision.sh
#
# This script creates:
#   1. Resource Group
#   2. Azure Database for PostgreSQL Flexible Server
#   3. Azure App Service (Linux, Node 20)
#   4. Azure Key Vault (stores secrets)
#   5. Wires Key Vault refs into App Service settings
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
SKU_DB="B_Standard_B1ms"      # Burstable, cheapest
SKU_APP="B1"                   # Basic tier

echo "=== Mint Clone Azure Provisioning ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo ""

# 1. Resource Group
echo "[1/5] Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# 2. PostgreSQL Flexible Server
echo "[2/5] Creating PostgreSQL server (this takes 2-5 minutes)..."
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
echo "[3/5] Creating Key Vault..."
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

# 4. App Service
echo "[4/5] Creating App Service..."
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
echo "[5/5] Configuring App Service..."
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

echo ""
echo "=== Provisioning Complete ==="
echo ""
echo "App URL:       https://${APP_NAME}.azurewebsites.net"
echo "DB Host:       $DB_HOST"
echo "DB Password:   $DB_ADMIN_PASSWORD  (saved in Key Vault)"
echo "JWT Secret:    (saved in Key Vault)"
echo "Key Vault:     $KEYVAULT_NAME"
echo ""
echo "Next steps:"
echo "  1. Add Plaid/Anthropic secrets to Key Vault (see commands above)"
echo "  2. Deploy code: git push azure master (or use GitHub Actions)"
echo "  3. Run migrations: the app runs them automatically on startup"
echo ""
