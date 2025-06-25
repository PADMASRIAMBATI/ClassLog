import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import "./UploadVideo.css"; // Reusing the same CSS for consistency

const UpdateDashboard = () => {
  const [dashboardSettings, setDashboardSettings] = useState({});
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const navigate = useNavigate();
  
  // API base URL - matching the same URL used in UploadVideo.js
  const API_BASE_URL = "http://127.0.0.1:5000";

  // Get JWT token from localStorage - using the same method as UploadVideo.js
  const getToken = () => {
    return localStorage.getItem('token');
  };

  // Headers for authenticated requests - matching UploadVideo.js
  const getAuthHeaders = (contentType = 'application/json') => {
    const headers = {
      'Authorization': `Bearer ${getToken()}`
    };
    
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    return headers;
  };

  // Fetch existing dashboard settings when component loads
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("Authentication required. Please log in.");
      setIsLoading(false);
      return;
    }
    
    fetchDashboardSettings();
  }, []);

  const fetchDashboardSettings = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard-settings`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        // Remove user_id and _id from the data as we don't want to display/edit these
        const { user_id, _id, ...settings } = data;
        
        if (Object.keys(settings).length === 0) {
          // If no settings found, initialize with some default fields
          setDashboardSettings({
            displayName: '',
            theme: 'light',
            defaultLanguage: 'english'
          });
        } else {
          setDashboardSettings(settings);
        }
      } else if (response.status === 404) {
        // No dashboard settings found, create empty state
        setDashboardSettings({
          displayName: '',
          theme: 'light',
          defaultLanguage: 'english'
        });
      } else {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error("Error fetching dashboard settings:", error);
      setError("Failed to load dashboard settings. Creating new settings.");
      
      // Initialize with default values
      setDashboardSettings({
        displayName: '',
        theme: 'light',
        defaultLanguage: 'english'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDashboard = async () => {
    setIsProcessing(true);
    setError(null);
    setMessage('');
    
    try {
      // Validate settings
      if (Object.keys(dashboardSettings).length === 0) {
        throw new Error("Dashboard settings cannot be empty");
      }
      
      const response = await fetch(`${API_BASE_URL}/update-dashboard`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(dashboardSettings),
      });
      
      console.log("Update response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error("Update error:", errorData);
        throw new Error(`Error ${response.status}: ${errorData || response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Update response data:", data);
      
      if (response.status === 201) {
        setMessage('Dashboard created successfully!');
      } else if (response.status === 200) {
        setMessage('Dashboard updated successfully!');
      } else if (response.status === 400) {
        setMessage('No changes made to the dashboard.');
      }
      
    } catch (error) {
      console.error("Error updating dashboard:", error);
      setError(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (key, value) => {
    setDashboardSettings({
      ...dashboardSettings,
      [key]: value
    });
  };

  // Add a new key-value pair to the dashboard
  const addNewField = () => {
    // Generate a unique key
    let newKey = "setting" + (Object.keys(dashboardSettings).length + 1);
    
    // Make sure the key is unique
    while (dashboardSettings.hasOwnProperty(newKey)) {
      newKey = "setting" + (parseInt(newKey.replace("setting", "")) + 1);
    }
    
    setDashboardSettings({
      ...dashboardSettings,
      [newKey]: ''
    });
  };

  // Remove a key-value pair from the dashboard
  const removeField = (keyToRemove) => {
    const { [keyToRemove]: _, ...remainingSettings } = dashboardSettings;
    setDashboardSettings(remainingSettings);
  };

  if (isLoading) {
    return (
      <div className="upload-container">
        <h1>Dashboard Settings</h1>
        <div className="loading-indicator">Loading dashboard settings...</div>
      </div>
    );
  }

  return (
    <div className="upload-container">
      <h1>Dashboard Settings</h1>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <details>
            <summary>Debug Info</summary>
            <p>Please ensure:</p>
            <ul>
              <li>Your JWT token is valid</li>
              <li>Your backend server is running at {API_BASE_URL}</li>
              <li>CORS is properly configured on the backend</li>
            </ul>
          </details>
        </div>
      )}

      {message && (
        <div className="response-message">
          <p>{message}</p>
        </div>
      )}
      
      <div className="upload-section">
        <h2>Update Your Dashboard</h2>
        
        <div className="dashboard-form">
          {Object.keys(dashboardSettings).map((key) => (
            <div key={key} className="form-group">
              <label htmlFor={`setting-${key}`}>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}:</label>
              <div className="input-with-button">
                <input
                  id={`setting-${key}`}
                  type="text"
                  value={dashboardSettings[key]}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  className="form-control"
                />
                <button 
                  onClick={() => removeField(key)}
                  className="remove-button"
                  title={`Remove ${key}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          
          <div className="button-group">
            <button
              onClick={addNewField}
              className="secondary-button"
              disabled={isProcessing}
            >
              Add New Setting
            </button>
            
            <button
              onClick={handleUpdateDashboard}
              className="primary-button"
              disabled={isProcessing || Object.keys(dashboardSettings).length === 0}
            >
              {isProcessing ? "Saving..." : "Save Dashboard Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateDashboard;