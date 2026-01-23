"""Migration: Add is_warning column to analyses table.

Run with: python -m migrations.add_is_warning
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

    # Check if column already exists
    cursor.execute("PRAGMA table_info(analyses)")
    columns = [col[1] for col in cursor.fetchall()]

    if "is_warning" in columns:
        print("Column 'is_warning' already exists, skipping")
        conn.close()
        return

    # Add the column
    print("Adding 'is_warning' column to analyses table...")
    cursor.execute("ALTER TABLE analyses ADD COLUMN is_warning BOOLEAN DEFAULT 0")
    conn.commit()
    print("Migration complete!")

    conn.close()


if __name__ == "__main__":
    migrate()
