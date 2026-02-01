# Contributor Guide

This guide explains how to use the Social Monitor to track and respond to Reddit posts about Copilot Studio.

---

## Getting Started

### 1. Sign In

Sign in with your Microsoft account. You'll be automatically linked to your contributor profile via your Microsoft alias.

### 2. Add Your Reddit Handle

If you've been added with only your Microsoft alias (as a "Reader"), you need a Reddit handle to become a full contributor who can take action on posts.

Ask an admin to update your profile with your Reddit handle (e.g., `YourRedditUsername`).

Once your Reddit handle is added:
- You can checkout and resolve posts
- The system will detect when you reply on Reddit and mark posts as "Handled"
- Your responses are tracked in contributor analytics

![Contributors Page](screenshots/contributors.png)

---

## Dashboard Overview

The dashboard shows key metrics at a glance:

![Dashboard](screenshots/dashboard.png)

| Metric | What It Means |
|--------|---------------|
| **Total Posts** | All scraped posts from r/CopilotStudio |
| **Waiting for Pickup** | Posts that need attention (not checked out, not resolved) |
| **In Progress** | Posts someone has checked out and is working on |
| **Handled** | Posts with an MS response or marked as resolved |
| **Negative Sentiment** | Percentage of analyzed posts with negative sentiment |

**Pay attention to:**
- High "Waiting for Pickup" numbers - posts need attention
- Negative sentiment percentage - indicates community frustration level

---

## Finding Posts to Handle

### Posts Page

Go to **Posts** to see all Reddit posts:

![Posts List](screenshots/posts-list.png)

### Filters

Use filters to find posts that need your attention:

| Filter | Use When |
|--------|----------|
| **Status: Open** | See posts that aren't resolved yet |
| **Status: Mine** | See posts you've checked out |
| **Sentiment: Negative** | Prioritize frustrated users |

### What to Look For

- **Negative** badge (red) - User is frustrated, prioritize these
- **Neutral** badge - User asking for help, good opportunity to assist
- **Handled** badge (green) - Already has an MS response
- **Checkout badge** (shows contributor initials) - Someone is working on it

---

## Checking Out Posts

### Why Checkout?

Checking out a post tells the team "I'm handling this one" to prevent duplicate responses.

### How to Checkout

1. Click on a post to open the detail view
2. Click **Checkout to handle**

![Post Detail](screenshots/post-detail.png)

The post will now show your initials, and teammates will see it's being handled.

### When to Checkout

- You're about to respond on Reddit
- You're researching the issue and plan to respond
- You want to claim it before someone else does

### Releasing a Checkout

If you can't handle a post after checking it out:
1. Open the post detail
2. Click **Release** to make it available again

---

## Resolving Posts

### When to Resolve

Mark a post as **resolved** when:

1. **You responded** - You posted a helpful reply on Reddit
2. **Someone else responded well** - A community member or colleague already gave a good answer
3. **No action needed** - The post doesn't require an MS response (e.g., general discussion, already outdated)

### How to Resolve

1. Open the post detail
2. Click **Mark as Done**

The post moves to "Handled" status and won't appear in the "Open" filter.

### Reopening a Post

If a resolved post needs follow-up:
1. Open the post detail
2. Click **Reopen**

---

## Discovering Pain Points

The **Themes** page shows recurring issues discovered by analyzing posts:

![Themes](screenshots/clustering-heatmap.png)

Use this to:
- Understand common pain points
- Identify areas needing documentation
- Spot trends in user frustration

---

## Tips for Effective Responses

1. **Be timely** - Respond within 24-48 hours when possible
2. **Be helpful** - Provide actionable solutions, not just acknowledgments
3. **Link to docs** - Point users to relevant documentation
4. **Follow up** - Check back if the user has questions
5. **Checkout first** - Prevent duplicate responses from teammates

---

## Quick Reference

| Action | When | How |
|--------|------|-----|
| Checkout | Starting to work on a post | Post detail → "Checkout to handle" |
| Release | Can't handle after checkout | Post detail → "Release" |
| Resolve | Done with post | Post detail → "Mark as Done" |
| Reopen | Need to revisit | Post detail → "Reopen" |
| Filter to Mine | See your active posts | Posts → Status: Mine |
| Filter Negative | Prioritize frustrated users | Posts → Sentiment: Negative |
