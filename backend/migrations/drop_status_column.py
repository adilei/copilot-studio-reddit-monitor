"""Migration: Drop status column from posts table.

The status field conflated analysis state with resolution state.
Analysis state is now derived from whether analyses exist.

Run with: python -m migrations.drop_status_column
"""
import sqlite3
import os

DB_PATH = "data/reddit_monitor.db"


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}, skipping migration")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if column exists
    cursor.execute("PRAGMA table_info(posts)")
    columns = [col[1] for col in cursor.fetchall()]

    if "status" not in columns:
        print("Column 'status' does not exist, skipping")
        conn.close()
        return

    # SQLite doesn't support DROP COLUMN directly in older versions
    # We need to recreate the table without the status column
    print("Dropping 'status' column from posts table...")

    # Create new table without status column
    cursor.execute("""
        CREATE TABLE posts_new (
            id TEXT PRIMARY KEY,
            subreddit TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            author TEXT NOT NULL,
            url TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            num_comments INTEGER DEFAULT 0,
            created_utc DATETIME NOT NULL,
            scraped_at DATETIME,
            checked_out_by INTEGER REFERENCES contributors(id),
            checked_out_at DATETIME
        )
    """)

    # Copy data (excluding status)
    cursor.execute("""
        INSERT INTO posts_new (id, subreddit, title, body, author, url, score,
                               num_comments, created_utc, scraped_at,
                               checked_out_by, checked_out_at)
        SELECT id, subreddit, title, body, author, url, score,
               num_comments, created_utc, scraped_at,
               checked_out_by, checked_out_at
        FROM posts
    """)

    # Drop old table and rename new one
    cursor.execute("DROP TABLE posts")
    cursor.execute("ALTER TABLE posts_new RENAME TO posts")

    # Recreate indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_posts_subreddit ON posts(subreddit)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_posts_author ON posts(author)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_posts_created_utc ON posts(created_utc)")

    conn.commit()
    print("Migration complete!")

    conn.close()


if __name__ == "__main__":
    migrate()
