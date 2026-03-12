# Persistence & Error Handling Plan

## 1. Server-Side Persistence (Data Storage)

- [ ] **Create Data Directory**: Ensure a dedicated `data/` or `storage/` directory exists to store group data permanently.
- [ ] **Implement Persistence Manager**: Create a system to save group state (ID, content, language, created/active timestamps) to disk (e.g., `groups.json` or individual JSON files per group).
- [ ] **Save on Change**: Update `GroupManager` to save group state specifically when:
  - A group is created.
  - Code is modified (debounced to avoid excessive writes).
  - Language is changed.
- [ ] **Load on Startup/Join**: Modify `GroupManager` to:
  - Load all saved groups into memory when the server starts.
  - OR lazy-load a group from disk when a user tries to join it if it's not currently active in memory.

## 2. File System Persistence

- [ ] **Persist Virtual Files**: If the application supports multiple files per group (via `FileSystemManager`), ensure the file structure and contents for each group are also serialized and saved to disk.
- [ ] **Restore Files**: Ensure that when a group is loaded, its associated file tree is also correctly restored.

## 3. Client-Side Error Handling (Login Page)

- [ ] **Refine Group Validation**:
  - Instead of just alerting _after_ a socket event, strictly validate the group ID existence via a dedicated API call (HTTP `GET /api/groups/:id` or `POST /api/validate-group`) _before_ attempting the socket connection.
  - This allows showing an inline error message (e.g., "Group not found") directly on the form input field, preventing the "logging in" state/transition entirely for invalid groups.
- [ ] **UI Feedback**: Update `GroupSelector` to display these validation errors visually (red border/text) instead of using browser `alert()` popups.

## 4. Session/State Management

- [ ] **Group Cleanup Policy**: Update the cleanup logic (`cleanupInactiveGroups`) to maybe _unload_ groups from memory but keep them on disk, rather than deleting them permanently, ensuring work is never lost.
- [ ] **Delete Policy**: Implement a specific "Delete Group" feature if users actually want to remove data permanently.
