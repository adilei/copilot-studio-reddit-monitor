from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings
import os

settings = get_settings()

# Ensure database directory exists (handles both relative and absolute paths)
db_url = settings.database_url
if db_url.startswith("sqlite:///"):
    db_path = db_url.replace("sqlite:///", "")
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}  # SQLite specific
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for getting database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    from app.models import post, contributor, analysis, clustering  # noqa: F401
    Base.metadata.create_all(bind=engine)
    seed_product_areas()


def seed_product_areas():
    """Seed default product areas if they don't exist."""
    from app.models import ProductArea

    db = SessionLocal()
    try:
        # Check if product areas already exist
        existing_count = db.query(ProductArea).count()
        if existing_count > 0:
            return  # Already seeded

        default_areas = [
            {
                "name": "Agent Flows / Power Automate",
                "description": "Agent flow authoring (natural language or drag-and-drop designer), flow triggers, actions, input/output variables, calling flows from topics, real-time vs async execution, flow timeouts, data size limits (1MB), flow billing/consumption",
                "display_order": 1,
            },
            {
                "name": "Generative Answers / Knowledge / RAG",
                "description": "Knowledge sources (SharePoint, files, websites, Dataverse, Azure AI Search), RAG retrieval quality, chunking/indexing, citation accuracy, knowledge refresh/sync delays, generative answers nodes, grounding, hallucination issues, content filtering",
                "display_order": 2,
            },
            {
                "name": "Autonomous Agents / Triggers",
                "description": "Event triggers (Dataverse, SharePoint, OneDrive), scheduled agents, running without user prompts, trigger payload handling, maker credential authentication for autonomous runs, background agent execution",
                "display_order": 3,
            },
            {
                "name": "Analytics",
                "description": "Session analytics, conversation transcripts, custom analytics via Dataverse, Viva Insights integration, agent effectiveness reporting, usage metrics, telemetry, 30-day data retention, transcript downloads",
                "display_order": 4,
            },
            {
                "name": "Tools / Connectors",
                "description": "Prebuilt connectors (1000+), custom connectors via OpenAPI, premium vs standard connectors, connection management, tool groups, connector authentication, schema/type mapping issues, API rate limits",
                "display_order": 5,
            },
            {
                "name": "MCP",
                "description": "Model Context Protocol servers, MCP resources/tools/prompts, Streamable transport (SSE deprecated), API key or OAuth authentication, dynamic tool discovery, MCP server creation and connectivity",
                "display_order": 6,
            },
            {
                "name": "Channels",
                "description": "Teams deployment (persistent sessions, caching), web chat, Microsoft 365 Copilot channel, SharePoint, Power Pages, Facebook, Direct Line API, channel-specific authentication, demo website, channel parity gaps",
                "display_order": 7,
            },
            {
                "name": "User Experience",
                "description": "Topic authoring canvas, AI-assisted topic creation (Copilot), system vs custom topics, node types (messages, questions, conditions), YAML code editor, conversation flow design, topic management, test chat",
                "display_order": 8,
            },
            {
                "name": "Governance",
                "description": "DLP data policies, data residency, compliance certifications, Microsoft Purview auditing, environment-level controls, sensitivity labels, security governance, RBAC, tenant-level publishing controls",
                "display_order": 9,
            },
            {
                "name": "Lifecycle / Admin",
                "description": "ALM (dev/test/prod environments), Power Platform solutions, pipelines, CI/CD, source control (Git), managed solutions, environment variables, connection references, licensing, billing, environment provisioning",
                "display_order": 10,
            },
            {
                "name": "Orchestration",
                "description": "Generative orchestration, multi-agent patterns, connected agents, child/inline agents, handoffs between agents, conversation history passing, A2A protocol, plan building, agent-to-human handoff",
                "display_order": 11,
            },
            {
                "name": "Pro Dev Experience",
                "description": "Microsoft 365 Copilot APIs, SDKs (.NET, Python, TypeScript), REST API integration via OpenAPI, API plugins, Microsoft 365 Agents Toolkit for VS Code, Teams Toolkit, custom engine agents, SPFx integration",
                "display_order": 12,
            },
        ]

        for area_data in default_areas:
            product_area = ProductArea(**area_data)
            db.add(product_area)

        db.commit()
    finally:
        db.close()
