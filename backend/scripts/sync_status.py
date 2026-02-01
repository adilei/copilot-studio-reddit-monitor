#!/usr/bin/env python3
"""
Quick one-off script to sync checkout status from main to EMEA.

Usage:
    python scripts/sync_status.py --token YOUR_TOKEN
    python scripts/sync_status.py --dry-run  # preview without making changes
"""

import argparse
import httpx

# Default URLs
SOURCE = "https://mcs-social-api-amafe4bmc8b5cnf9.swedencentral-01.azurewebsites.net"
DEST = "https://mcs-social-api-emea.azurewebsites.net"


def main():
    parser = argparse.ArgumentParser(description="Sync checkout status from main to EMEA")
    parser.add_argument("--token", help="Bearer token for authenticated endpoints")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    args = parser.parse_args()

    dest_headers = {}
    if args.token:
        dest_headers["Authorization"] = f"Bearer {args.token}"

    with httpx.Client(timeout=60) as client:
        # 1. Fetch contributors from both to build name mapping
        print("Fetching contributors from source...", flush=True)
        source_contributors = client.get(f"{SOURCE}/api/contributors").json()
        print(f"  Found {len(source_contributors)} contributors")

        print("Fetching contributors from destination...")
        dest_contributors = client.get(f"{DEST}/api/contributors", headers=dest_headers).json()
        print(f"  Found {len(dest_contributors)} contributors")

        # Build mapping: source_id -> dest_id (via reddit_handle)
        dest_by_handle = {c["reddit_handle"].lower(): c["id"] for c in dest_contributors}
        source_to_dest_id = {}
        for sc in source_contributors:
            handle = sc["reddit_handle"].lower()
            if handle in dest_by_handle:
                source_to_dest_id[sc["id"]] = dest_by_handle[handle]

        print(f"  Mapped {len(source_to_dest_id)} contributors between systems")

        # 2. Fetch all posts from source (paginated, max 100 per request)
        print("\nFetching posts from source...")
        source_posts = []
        offset = 0
        while True:
            batch = client.get(f"{SOURCE}/api/posts", params={"limit": 100, "offset": offset}).json()
            if not batch:
                break
            source_posts.extend(batch)
            if len(batch) < 100:
                break
            offset += 100
        print(f"  Found {len(source_posts)} posts")

        # 3. Find checked out posts
        to_checkout = []
        for post in source_posts:
            if post.get("checked_out_by"):
                dest_contributor_id = source_to_dest_id.get(post["checked_out_by"])
                if dest_contributor_id:
                    to_checkout.append({
                        "post_id": post["id"],
                        "title": post["title"][:50],
                        "contributor_id": dest_contributor_id,
                        "contributor_name": post.get("checked_out_by_name", "Unknown"),
                    })

        print(f"\nPosts to checkout: {len(to_checkout)}")

        if args.dry_run:
            print("\n--- DRY RUN ---")
            for item in to_checkout:
                print(f"  - {item['post_id']}: {item['title']}... (by {item['contributor_name']})")
            return

        # 4. Apply checkouts
        print("\nApplying checkouts...")
        for item in to_checkout:
            try:
                resp = client.post(
                    f"{DEST}/api/posts/{item['post_id']}/checkout",
                    json={"contributor_id": item["contributor_id"]},
                    headers=dest_headers
                )
                if resp.status_code == 200:
                    print(f"  ✓ {item['post_id']}: {item['title']}...")
                else:
                    print(f"  ✗ {item['post_id']}: {resp.status_code} - {resp.text[:100]}")
            except Exception as e:
                print(f"  ✗ {item['post_id']}: {e}")

        print("\nDone!")


if __name__ == "__main__":
    main()
