import './Breadcrumb.css';

function Breadcrumb({ currentFile, groupId }) {
    if (!currentFile) return null;

    const pathParts = currentFile.split('/').filter(part => part);

    return (
        <div className="breadcrumb">
            <div className="breadcrumb-item">
                <span className="breadcrumb-icon">📁</span>
                <span className="breadcrumb-text">{groupId}</span>
            </div>

            {pathParts.map((part, index) => (
                <div key={index} className="breadcrumb-item">
                    <span className="breadcrumb-separator">›</span>
                    <span className={`breadcrumb-text ${index === pathParts.length - 1 ? 'active' : ''}`}>
                        {part}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default Breadcrumb;
