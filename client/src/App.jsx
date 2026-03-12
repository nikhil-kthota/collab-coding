import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import CollaborativeEditor from './components/CollaborativeEditor';
import './App.css';

function App() {
  const [searchParams] = useSearchParams();

  // Read group info directly from URL params passed by CLP dashboard
  const [groupId] = useState(() => searchParams.get('groupId') || null);
  const [userName] = useState(() => {
    const urlName = searchParams.get('userName') || searchParams.get('groupName');
    if (urlName) return urlName;
    return localStorage.getItem('userName') || 'Anonymous';
  });
  const [isCreating] = useState(() => searchParams.get('creating') === 'true');
  const [userId] = useState(() => uuidv4());

  // Persist username for future sessions
  useEffect(() => {
    if (userName) localStorage.setItem('userName', userName);
  }, [userName]);

  const handleLeaveGroup = () => {
    window.close(); // close the editor tab and go back to CLP
  };

  if (!groupId) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1e1e2e', color: '#cdd6f4' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>No group specified</h2>
          <p style={{ opacity: 0.6 }}>Please open this editor from the CLP dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="editor-container">
        <CollaborativeEditor
          groupId={groupId}
          userName={userName}
          userId={userId}
          isCreating={isCreating}
          onLeaveGroup={handleLeaveGroup}
        />
      </div>
    </div>
  );
}

export default App;
