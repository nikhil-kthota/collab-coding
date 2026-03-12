import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import './GroupSelector.css';

function GroupSelector({ onJoinGroup, initialUserName }) {
  const [groupId, setGroupId] = useState('');
  const [userName, setUserName] = useState(initialUserName || '');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!userName.trim()) {
      alert('Please enter your name');
      return;
    }

    const finalGroupId = isCreating ? uuidv4().split('-')[0] : groupId.trim();
    
    if (!finalGroupId) {
      alert('Please enter a group ID');
      return;
    }

    onJoinGroup(finalGroupId, userName.trim(), isCreating);
  };

  const handleCreateGroup = () => {
    setIsCreating(true);
    setGroupId(uuidv4().split('-')[0]);
  };

  return (
    <div className="group-selector">
      <div className="group-selector-card">
        <h1>🚀 Collaborative Code Editor</h1>
        <p className="subtitle">Real-time coding with your team</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userName">Your Name</label>
            <input
              id="userName"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="groupId">Group ID</label>
            <input
              id="groupId"
              type="text"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setIsCreating(false);
              }}
              placeholder="Enter group ID to join"
              disabled={isCreating}
              required
            />
          </div>

          <div className="button-group">
            <button type="submit" className="btn-primary">
              {isCreating ? 'Create & Join Group' : 'Join Group'}
            </button>
            
            {!isCreating && (
              <button
                type="button"
                onClick={handleCreateGroup}
                className="btn-secondary"
              >
                Create New Group
              </button>
            )}
          </div>
        </form>

        <div className="features">
          <div className="feature">
            <span className="feature-icon">⚡</span>
            <span>Real-time Sync</span>
          </div>
          <div className="feature">
            <span className="feature-icon">👥</span>
            <span>Multi-user</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🎨</span>
            <span>Syntax Highlighting</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomSelector;
