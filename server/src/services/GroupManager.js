/**
 * Group Manager - Handles group creation, user management, and document state
 */
class GroupManager {
  constructor() {
    this.groups = new Map();
    this.userGroupMap = new Map(); // Track which groups each user is in
  }

  /**
   * Check if a group exists
   */
  groupExists(groupId) {
    return this.groups.has(groupId);
  }

  /**
   * Join or create a group
   */
  joinGroup(groupId, userId, userName) {
    // Create group if it doesn't exist
    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, {
        id: groupId,
        content: '// Welcome to the collaborative code editor!\n// Start coding together...\n',
        language: 'java',
        users: new Map(),
        version: 0,
        operations: [], // Store operations for conflict resolution
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
    }

    const group = this.groups.get(groupId);
    
    // Add user to group
    group.users.set(userId, {
      id: userId,
      name: userName,
      joinedAt: Date.now(),
      color: this.generateUserColor(userId)
    });
    
    // Track user's groups
    if (!this.userGroupMap.has(userId)) {
      this.userGroupMap.set(userId, new Set());
    }
    this.userGroupMap.get(userId).add(groupId);
    
    group.lastActivity = Date.now();
    
    return group;
  }

  /**
   * Leave a group
   */
  leaveGroup(groupId, userId) {
    const group = this.groups.get(groupId);
    if (!group) return null;

    group.users.delete(userId);
    
    // Remove from user group map
    if (this.userGroupMap.has(userId)) {
      this.userGroupMap.get(userId).delete(groupId);
      if (this.userGroupMap.get(userId).size === 0) {
        this.userGroupMap.delete(userId);
      }
    }

    // Delete empty groups after 5 minutes of inactivity
    if (group.users.size === 0) {
      setTimeout(() => {
        const currentGroup = this.groups.get(groupId);
        if (currentGroup && currentGroup.users.size === 0) {
          this.groups.delete(groupId);
          console.log(`Group ${groupId} deleted due to inactivity`);
        }
      }, 5 * 60 * 1000);
    }

    return group;
  }

  /**
   * Get group by ID
   */
  getGroup(groupId) {
    return this.groups.get(groupId);
  }

  /**
   * Get all groups for a user
   */
  getUserGroups(userId) {
    return this.userGroupMap.get(userId) || new Set();
  }

  /**
   * Transform operation for conflict resolution
   */
  transformOperation(groupId, operation, version) {
    const group = this.groups.get(groupId);
    if (!group) return operation;

    // Get operations that happened after this version
    const missedOps = group.operations.slice(version);
    
    let transformedOp = operation;
    for (const missedOp of missedOps) {
      transformedOp = this.transformTwoOperations(transformedOp, missedOp);
    }

    return transformedOp;
  }

  /**
   * Simple operational transformation for two operations
   */
  transformTwoOperations(op1, op2) {
    // If operations don't conflict, return original
    if (op1.rangeOffset + op1.rangeLength <= op2.rangeOffset) {
      return op1;
    }
    
    if (op2.rangeOffset + op2.rangeLength <= op1.rangeOffset) {
      // Adjust offset based on op2's changes
      return {
        ...op1,
        rangeOffset: op1.rangeOffset + (op2.text.length - op2.rangeLength)
      };
    }

    // Operations overlap - use op2's position
    return {
      ...op1,
      rangeOffset: op2.rangeOffset + op2.text.length
    };
  }

  /**
   * Generate consistent color for user
   */
  generateUserColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
    ];
    
    // Use hash of userId to pick color
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get statistics
   */
  getGroupCount() {
    return this.groups.size;
  }

  getTotalUsers() {
    let total = 0;
    this.groups.forEach(group => {
      total += group.users.size;
    });
    return total;
  }

  /**
   * Clean up inactive groups (call periodically)
   */
  cleanupInactiveGroups(maxInactivityMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const groupsToDelete = [];

    this.groups.forEach((group, groupId) => {
      if (group.users.size === 0 && (now - group.lastActivity) > maxInactivityMs) {
        groupsToDelete.push(groupId);
      }
    });

    groupsToDelete.forEach(groupId => {
      this.groups.delete(groupId);
      console.log(`Cleaned up inactive group: ${groupId}`);
    });

    return groupsToDelete.length;
  }
}

export default GroupManager;
