# UI Test Plan - Copilot Studio Reddit Monitor

## Prerequisites
- Backend running on http://localhost:8000
- Frontend running on http://localhost:3000 (or 3001/3002)
- Ollama running with llama3.2 model
- At least one contributor added (for handled detection tests)

---

## 1. Dashboard Page (`/`)

### 1.1 Initial Load
- [ ] Dashboard loads without errors
- [ ] All 4 stat cards display correctly (Total Posts, Negative Sentiment, Handled, Pending)
- [ ] Scraper status section shows "Idle" or "Running"
- [ ] "Scrape Now" button is visible and enabled

### 1.2 Scrape Functionality
- [ ] Click "Scrape Now" button
- [ ] Button text changes to "Scraping..." and shows spinner
- [ ] Status indicator shows green pulsing dot
- [ ] Dashboard auto-refreshes while scraping (every 3 seconds)
- [ ] Stats update after scrape completes
- [ ] "Last run" timestamp updates
- [ ] "Posts scraped in last run" shows count

### 1.3 Dashboard Tile Navigation
- [ ] Click "Total Posts" card → navigates to `/posts` with no filters
- [ ] Click "Negative Sentiment" card → navigates to `/posts?sentiment=negative`
- [ ] Click "Handled" card → navigates to `/posts?status=handled`
- [ ] Click "Pending" card → navigates to `/posts?status=pending`
- [ ] Each navigation shows correctly filtered posts

### 1.4 Stats Accuracy
- [ ] "Scraped in last 24h" count matches posts scraped within 24 hours
- [ ] "Negative Sentiment %" matches proportion of negative posts
- [ ] "Handled %" matches proportion of posts with contributor replies
- [ ] "Pending" count matches posts awaiting analysis

---

## 2. Posts List Page (`/posts`)

### 2.1 Initial Load
- [ ] Posts list loads without errors
- [ ] Posts display with title, author, subreddit, sentiment badge
- [ ] Posts sorted by date (newest first by default)

### 2.2 Status Filter
- [ ] Select "Pending" → shows only pending posts
- [ ] Select "Analyzed" → shows only analyzed posts
- [ ] Select "Handled" → shows only handled posts
- [ ] Select "All Status" → clears filter, shows all posts
- [ ] Filter persists after page refresh (via URL params)

### 2.3 Sentiment Filter
- [ ] Select "Positive" → shows only posts with positive sentiment
- [ ] Select "Neutral" → shows only posts with neutral sentiment
- [ ] Select "Negative" → shows only posts with negative sentiment
- [ ] Select "All Sentiment" → clears filter
- [ ] **CRITICAL**: Filtered posts should ALL match selected sentiment (no mixed results)

### 2.4 Combined Filters
- [ ] Can combine status + sentiment filters
- [ ] URL shows both params: `/posts?status=handled&sentiment=negative`
- [ ] "Clear filters" button appears when any filter active
- [ ] Clicking "Clear filters" removes all filters and reloads

### 2.5 Subreddit Filter
- [ ] Type in subreddit input → posts filter as you type
- [ ] Only posts from matching subreddit shown

### 2.6 Navigation from Dashboard
- [ ] Navigate from Dashboard "Handled" tile
- [ ] Posts page loads with `?status=handled` in URL
- [ ] Status dropdown shows "Handled" selected
- [ ] Only handled posts displayed (no pending/analyzed posts)

### 2.7 Refresh Button
- [ ] Click "Refresh" reloads posts with current filters

---

## 3. Post Detail Page (`/posts/[id]`)

### 3.1 Initial Load
- [ ] Post detail loads for valid post ID
- [ ] Shows full post title and body
- [ ] Shows author, score, comments count
- [ ] Shows subreddit and link to Reddit
- [ ] Shows status badge
- [ ] Shows sentiment badge (if analyzed)

### 3.2 Analysis Section
- [ ] Shows analysis summary
- [ ] Shows sentiment score
- [ ] Shows key issues (if any)
- [ ] Shows model used and timestamp
- [ ] Multiple analyses shown if post was re-analyzed

### 3.3 Contributor Replies
- [ ] Shows contributor reply list (if any)
- [ ] Shows contributor name, handle, timestamp

### 3.4 Actions
- [ ] "Analyze" button triggers new analysis
- [ ] Loading state shows during analysis
- [ ] New analysis appears in list after completion
- [ ] "Back to Posts" link works

### 3.5 Error Handling
- [ ] Invalid post ID shows 404 error
- [ ] Network errors show appropriate message

---

## 4. Contributors Page (`/contributors`)

### 4.1 Initial Load
- [ ] Contributors list loads
- [ ] Shows name, Reddit handle, role
- [ ] Shows reply count for each contributor

### 4.2 Add Contributor
- [ ] Fill in name, Reddit handle (with u/ prefix), optional role
- [ ] Click "Add Contributor"
- [ ] New contributor appears in list
- [ ] Form clears after success

### 4.3 Delete Contributor
- [ ] Click delete button on contributor
- [ ] Contributor removed from list
- [ ] (Note: This doesn't remove historical reply records)

### 4.4 Validation
- [ ] Cannot add contributor without name
- [ ] Cannot add contributor without Reddit handle
- [ ] Duplicate handle shows error

---

## 5. Analytics Page (`/analytics`)

### 5.1 Initial Load
- [ ] Page loads without errors
- [ ] Sentiment trend chart displays
- [ ] Subreddit breakdown displays
- [ ] Contributor leaderboard displays

### 5.2 Sentiment Chart
- [ ] Shows positive, neutral, negative lines
- [ ] X-axis shows dates
- [ ] Y-axis shows counts
- [ ] Legend is visible

### 5.3 Status Breakdown
- [ ] Shows pie/bar chart of post statuses
- [ ] Counts match actual post counts

### 5.4 Contributor Leaderboard
- [ ] Shows top contributors by reply count
- [ ] Sorted by reply count descending

---

## 6. Navigation

### 6.1 Sidebar/Header Navigation
- [ ] Dashboard link works
- [ ] Posts link works
- [ ] Contributors link works
- [ ] Analytics link works
- [ ] Current page is highlighted

### 6.2 Browser Navigation
- [ ] Back button works correctly
- [ ] Forward button works correctly
- [ ] URL params preserved on navigation

---

## 7. Error States

### 7.1 Backend Offline
- [ ] Shows appropriate error message
- [ ] Retry option available
- [ ] UI doesn't crash

### 7.2 Ollama Offline
- [ ] Scraping still works
- [ ] Analysis shows error message
- [ ] UI doesn't crash

### 7.3 Empty States
- [ ] No posts: Shows "No posts found" message
- [ ] No contributors: Shows empty state
- [ ] No analytics data: Charts handle gracefully

---

## 8. Performance

### 8.1 Loading States
- [ ] Dashboard shows loading state initially
- [ ] Posts list shows "Loading posts..." while fetching
- [ ] Analysis shows loading during processing

### 8.2 Auto-refresh
- [ ] Dashboard auto-refreshes during active scrape
- [ ] Auto-refresh stops when scrape completes
- [ ] No memory leaks from intervals

---

## Known Issues to Verify Fixed

1. **Sentiment Filter Bug** (Fixed in commit ddacc59)
   - [ ] Negative filter shows ONLY negative posts
   - [ ] No neutral posts appear in negative filter
   - [ ] Test with posts that have multiple analyses

2. **Status Filter from Dashboard** (Fixed in commit 26d6719)
   - [ ] Click "Handled" tile on dashboard
   - [ ] Posts page shows ONLY handled posts
   - [ ] Status dropdown shows "Handled" selected

3. **"Last 24 Hours" Display** (Fixed in commit 26d6719)
   - [ ] Dashboard shows "X scraped in last 24h"
   - [ ] Works correctly across timezones
