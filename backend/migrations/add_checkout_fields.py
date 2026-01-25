"""Migration: Add checkout fields to posts table.

Run with: python -m migrations.add_checkout_fields
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

    # Check if columns already exist
    cursor.execute("PRAGMA table_info(posts)")
    columns = [col[1] for col in cursor.fetchall()]

    if "checked_out_by" in columns:
        print("Checkout columns already exist, skipping")
        conn.close()
        return

    # Add the columns
    print("Adding checkout columns to posts table...")
    cursor.execute("ALTER TABLE posts ADD COLUMN checked_out_by INTEGER REFERENCES contributors(id)")
    cursor.execute("ALTER TABLE posts ADD COLUMN checked_out_at DATETIME")
    conn.commit()
    print("Migration complete!")

    conn.close()


if __name__ == "__main__":
    migrate()
