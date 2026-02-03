#!/bin/bash
# Deploy to EMEA Azure environment (backend and/or frontend)
#
# Usage:
#   ./scripts/deploy-emea.sh              # Deploy both backend and frontend
#   ./scripts/deploy-emea.sh --backend    # Deploy backend only
#   ./scripts/deploy-emea.sh --frontend   # Deploy frontend only
#   ./scripts/deploy-emea.sh --help       # Show help
#
# Prerequisites:
#   - Azure CLI logged in (az login)
#   - Node.js and npm installed
#   - Python venv set up in backend/

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# EMEA Configuration
RESOURCE_GROUP="mcs-social-rg"
BACKEND_APP_NAME="mcs-social-api-emea"
FRONTEND_SWA_NAME="mcs-social-web"

BACKEND_URL="https://mcs-social-api-emea.azurewebsites.net"
FRONTEND_URL="https://thankful-tree-0325e0003.1.azurestaticapps.net"

# Frontend build environment
export NEXT_PUBLIC_API_URL="$BACKEND_URL"
export NEXT_PUBLIC_AUTH_ENABLED="true"
export NEXT_PUBLIC_AZURE_AD_CLIENT_ID="8451fcdd-4db4-428f-8e09-e26d8fb01367"
export NEXT_PUBLIC_AZURE_AD_TENANT_ID="72f988bf-86f1-41af-91ab-2d7cd011db47"

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false

if [ $# -eq 0 ]; then
    # No args = deploy both
    DEPLOY_BACKEND=true
    DEPLOY_FRONTEND=true
else
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend|-b)
                DEPLOY_BACKEND=true
                shift
                ;;
            --frontend|-f)
                DEPLOY_FRONTEND=true
                shift
                ;;
            --help|-h)
                echo "Deploy to EMEA Azure environment"
                echo ""
                echo "Usage:"
                echo "  ./scripts/deploy-emea.sh              Deploy both backend and frontend"
                echo "  ./scripts/deploy-emea.sh --backend    Deploy backend only"
                echo "  ./scripts/deploy-emea.sh --frontend   Deploy frontend only"
                echo "  ./scripts/deploy-emea.sh -b -f        Deploy both (explicit)"
                echo ""
                echo "Options:"
                echo "  -b, --backend     Deploy backend to Azure App Service"
                echo "  -f, --frontend    Deploy frontend to Azure Static Web Apps"
                echo "  -h, --help        Show this help message"
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
fi

echo -e "${GREEN}=== EMEA Deployment ===${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Deploy backend: $DEPLOY_BACKEND"
echo "Deploy frontend: $DEPLOY_FRONTEND"
echo ""

# Check Azure CLI login
echo "Checking Azure CLI login..."
if ! az account show &>/dev/null; then
    echo -e "${RED}ERROR: Not logged into Azure CLI. Run 'az login' first.${NC}"
    exit 1
fi
echo -e "${GREEN}Azure CLI logged in${NC}"
echo ""

# Deploy Backend
if [ "$DEPLOY_BACKEND" = true ]; then
    echo -e "${YELLOW}=== Deploying Backend ===${NC}"
    echo "App Service: $BACKEND_APP_NAME"
    echo "Resource Group: $RESOURCE_GROUP"
    echo ""

    cd "$PROJECT_ROOT/backend"

    # Create deployment zip
    echo "Creating deployment package..."
    rm -f deploy.zip
    zip -r deploy.zip app migrations requirements.txt -x "*.pyc" -x "__pycache__/*" -x "*.egg-info/*"

    # Deploy to Azure
    echo "Deploying to Azure App Service..."
    az webapp deploy \
        --resource-group "$RESOURCE_GROUP" \
        --name "$BACKEND_APP_NAME" \
        --src-path deploy.zip \
        --type zip

    # Cleanup
    rm -f deploy.zip

    echo -e "${GREEN}Backend deployed: $BACKEND_URL${NC}"
    echo ""
fi

# Deploy Frontend
if [ "$DEPLOY_FRONTEND" = true ]; then
    echo -e "${YELLOW}=== Deploying Frontend ===${NC}"
    echo "Static Web App: $FRONTEND_SWA_NAME"
    echo "API URL: $NEXT_PUBLIC_API_URL"
    echo ""

    cd "$PROJECT_ROOT/frontend"

    # Build
    echo "Building frontend..."
    npm run build

    # Deploy
    echo "Deploying to Azure Static Web Apps..."
    echo "n" | npx @azure/static-web-apps-cli deploy ./out \
        --env production \
        --app-name "$FRONTEND_SWA_NAME"

    echo -e "${GREEN}Frontend deployed: $FRONTEND_URL${NC}"
    echo ""
fi

# Summary
echo -e "${GREEN}=== Deployment Complete ===${NC}"
if [ "$DEPLOY_BACKEND" = true ]; then
    echo "Backend:  $BACKEND_URL"
    echo "API Docs: $BACKEND_URL/docs"
fi
if [ "$DEPLOY_FRONTEND" = true ]; then
    echo "Frontend: $FRONTEND_URL"
fi
echo ""
