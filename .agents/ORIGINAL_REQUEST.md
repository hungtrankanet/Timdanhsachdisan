# Original User Request

## Initial Request — 2026-06-18T06:46:39Z

Update the Vietnamese lacquer art discovery crawler database queue to prioritize the 8 target provinces and expand ward/commune coverage to match Vietnam's new July 1st, 2025 administrative divisions.

Working directory: c:/PROJECT KANETTRAN/Timdanhsachdisan
Integrity mode: development

## Requirements

### R1. Focus on 8 Target Provinces
Ensure the crawler database queue exclusively focuses on the target provinces (Cần Thơ, Lâm Đồng, An Giang, Vĩnh Long, Đồng Tháp, Cà Mau, Tây Ninh, Bình Thuận). Existing Hồ Chí Minh City pending tasks should be set to a paused state.

### R2. Expand to 2025 Administrative Divisions
Add the new reorganized divisions (new wards and communes formed after the July 1st, 2025 reorganization) for these 8 provinces to the search queue.

### R3. Safe Database Queue Generation
Prevent duplicate entries in the `scheduler_queue` table when running the queue generator.

## Acceptance Criteria

### Task Prioritization & Exclusivity
- [ ] Only tasks matching the 8 target provinces are set to `pending` in the queue.
- [ ] All other pending tasks (such as HCMC) are temporarily set to `paused` (or `deferred`).

### Administrative Division Update
- [ ] The queue has been expanded with the post-July-2025 wards/communes for the 8 provinces.
- [ ] No duplicate `(keyword, location)` pairs exist in `scheduler_queue`.

### Crawler Execution
- [ ] The local scheduler server continues to run and picks up the target province tasks in priority order.

## Follow-up — 2026-06-18T15:17:43+07:00

Build a dedicated "Zalo Inbox" (CRM-style) tab on the lacquer art dashboard to display bidirectional chat history, with a background scheduler that automatically syncs Zalo Web chat histories every 30 minutes.

Working directory: c:/PROJECT KANETTRAN/Timdanhsachdisan
Integrity mode: development

## Requirements

### R1. Database Schema for Chat Logs
Create a new table `zalo_chat_logs` in SQLite to store messages:
- `lead_id` (foreign key to `leads.id`)
- `sender` ('me' for bot messages, 'client' for user replies)
- `message` (text content of the message)
- `timestamp` (datetime of the message)

### R2. Background Chat Sync Job
Implement a periodic background job in the scheduler:
- Runs every 30 minutes if Zalo is logged in.
- Iterates over contacted leads (status is `message_sent` or `friend_request_sent`).
- Automates Puppeteer to search for each contact on Zalo Web, open their chat, scrape the message log, and insert/update them in `zalo_chat_logs`.

### R3. Express API Endpoints
Create APIs:
- `GET /api/zalo/chats`: Returns a list of leads who have chat logs, including the last message content and timestamp.
- `GET /api/zalo/chats/:lead_id`: Returns the full chat history for a specific lead.

### R4. Premium Zalo Inbox UI Tab
Add a new tab "Hộp thư Zalo" in the dark vermilion/gold dashboard:
- Left Column: List of conversations (contacts) with name, phone, last message preview, and timestamp.
- Right Column: A chat bubble layout showing the conversation history (grey bubbles for client replies, vermilion/gold bubbles for bot sent messages) with a "Đồng bộ ngay" (Sync Now) manual trigger button.

## Acceptance Criteria

### Data Layer
- [ ] Database table `zalo_chat_logs` is created with correct foreign key mappings.
- [ ] No duplicate messages are stored in `zalo_chat_logs` when syncing multiple times.

### Sync Functionality
- [ ] The background scheduler successfully launches the chat sync job every 30 minutes.
- [ ] The sync job correctly extracts client replies and bot messages from Zalo Web DOM.

### UI Display
- [ ] The "Hộp thư Zalo" tab is rendered with the CRM layout.
- [ ] Clicking a contact in the left column correctly loads their chat logs on the right column.

