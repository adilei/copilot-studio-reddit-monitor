#!/bin/bash
# Deploy frontend to EMEA Azure Static Web App
# Usage: ./scripts/deploy-emea.sh (from frontend dir)
#    or: frontend/scripts/deploy-emea.sh (from project root)

set -e

# Change to frontend directory (where this script lives is in frontend/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$FRONTEND_DIR"

# EMEA Configuration
export NEXT_PUBLIC_API_URL="https://mcs-social-api-emea.azurewebsites.net"
export NEXT_PUBLIC_AZURE_AD_CLIENT_ID="8451fcdd-4db4-428f-8e09-e26d8fb01367"
export NEXT_PUBLIC_AZURE_AD_TENANT_ID="72f988bf-86f1-41af-91ab-2d7cd011db47"

AZURE_SWA_NAME="mcs-social-web"

echo "=== EMEA Frontend Deployment ==="
echo "Working directory: $(pwd)"
echo "Backend URL: $NEXT_PUBLIC_API_URL"
echo "Azure AD Client ID: $NEXT_PUBLIC_AZURE_AD_CLIENT_ID"
echo "Azure AD Tenant ID: $NEXT_PUBLIC_AZURE_AD_TENANT_ID"
echo ""

# Build
echo "Building frontend..."
npm run build

# Deploy
echo ""
echo "Deploying to Azure Static Web Apps..."
npx @azure/static-web-apps-cli deploy ./out --env production --app-name "$AZURE_SWA_NAME"

echo ""
echo "=== Deployment complete ==="
echo "Frontend URL: https://thankful-tree-0325e0003.1.azurestaticapps.net"
