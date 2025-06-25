import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, BookOpen, FileText, BookMarked, CheckCircle } from 'lucide-react';
import './Profile.css';

// Custom Card components with unique class names
const Card = ({ className, children }) => {
  return (
    <div className={`profile-card bg-white rounded-lg shadow-md ${className || ''}`}>
      {children}
    </div>
  );
};

const CardHeader = ({ children }) => {
  return <div className="profile-card-header px-6 py-4 border-b">{children}</div>;
};

const CardTitle = ({ className, children }) => {
  return <h2 className={`profile-card-title text-xl font-semibold ${className || ''}`}>{children}</h2>;
};

const CardContent = ({ children }) => {
  return <div className="profile-card-content px-6 py-4">{children}</div>;
};

// Fixed Progress component that maintains the correct width
const Progress = ({ value, className }) => {
  // Ensure value is a number and clamp it between 0 and 100
  const progressValue = Math.min(Math.max(parseFloat(value) || 0, 0), 100);
  
  return (
    <div className={`profile-progress-container w-full bg-gray-200 rounded-full overflow-hidden ${className || ''}`}>
      <div 
        className="profile-progress-bar bg-blue-600 h-full" 
        style={{ 
          "--progress-value": `${progressValue}%`,
          width: `${progressValue}%`  // Set width directly - this will be the end state
        }} 
        role="progressbar" 
        aria-valuenow={progressValue} 
        aria-valuemin="0" 
        aria-valuemax="100"
      ></div>
    </div>
  );
};

const Profile = () => {
  const [user, setUser] = useState({
    username: '',
    email: '',
    phone_number: '',
    created_at: ''
  });
  const [stats, setStats] = useState({
    subjects_count: 0,
    chapters_count: 0,
    topics_count: 0,
    lectures_count: 0,
    completed_topics: 0,
    incomplete_topics: 0,
    completion_percentage: 0
  });
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectProgress, setSubjectProgress] = useState({
    subject: '',
    chapters: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(true);

  // Fetch user data
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      setError('Authentication token not found. Please log in again.');
      setLoading(false);
      return;
    }
    
    // Configure headers with JWT token
    const config = {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    // Fetch user profile data
    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        // Fetch dashboard stats
        try {
          const statsResponse = await axios.get('http://localhost:5000/stats/dashboard', config);
          setStats(statsResponse.data);
        } catch (statsErr) {
          console.error('Failed to load dashboard stats:', statsErr);
        }
        
        // Fetch user subjects
        try {
          const subjectsResponse = await axios.get('http://localhost:5000/subjects', config);
          setSubjects(subjectsResponse.data);
        } catch (subjectsErr) {
          console.error('Failed to load subjects:', subjectsErr);
        }
        
        // Get user info from the correct endpoint '/user'
        try {
          const userResponse = await axios.get('http://localhost:5000/user', config);
          
          // Get additional user details if needed
          if (userResponse.data && userResponse.data.email) {
            try {
              // If you need more detailed user info that isn't in the JWT
              const userDetailsResponse = await axios.get(
                `http://localhost:5000/user-details?email=${userResponse.data.email}`,
                config
              );
              
              // Merge the user info from both responses
              setUser({
                username: userResponse.data.username || '',
                email: userResponse.data.email || '',
                phone_number: userDetailsResponse.data?.phone_number || '',
                created_at: userDetailsResponse.data?.created_at || new Date().toISOString()
              });
            } catch (detailsErr) {
              console.error('Failed to load detailed user info:', detailsErr);
              // Set partial user info from JWT response
              setUser({
                username: userResponse.data.username || '',
                email: userResponse.data.email || '',
                phone_number: '',
                created_at: new Date().toISOString()
              });
            }
          }
        } catch (userErr) {
          console.error('Failed to load user profile:', userErr);
          // Try fallback endpoint if /user fails
          try {
            const fallbackResponse = await axios.get('http://localhost:5000/profile', config);
            setUser(fallbackResponse.data);
          } catch (fallbackErr) {
            console.error('Fallback profile endpoint also failed:', fallbackErr);
            // Set default user info if both endpoints fail
            setUser({
              username: 'User',
              email: 'user@example.com',
              phone_number: '',
              created_at: new Date().toISOString()
            });
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('General error loading profile data:', err);
        setApiAvailable(false);
        setError('Failed to load profile data. API might be unavailable.');
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Fetch subject progress when a subject is selected
  useEffect(() => {
    if (selectedSubject && apiAvailable) {
      const token = localStorage.getItem('token');
      const config = {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const fetchSubjectProgress = async () => {
        try {
          const response = await axios.get(`http://localhost:5000/stats/progress/${selectedSubject}`, config);
          setSubjectProgress(response.data);
        } catch (err) {
          console.error('Failed to load subject progress', err);
          setSubjectProgress({
            subject: 'Subject information unavailable',
            chapters: []
          });
        }
      };

      fetchSubjectProgress();
    }
  }, [selectedSubject, apiAvailable]);

  if (loading) return <div className="profile-loading-container flex justify-center items-center h-screen">Loading profile...</div>;
  
  // Show error message with retry button
  if (error) {
    return (
      <div className="profile-error-container flex flex-col items-center justify-center h-screen">
        <div className="profile-error-message text-red-500 text-center mb-4">{error}</div>
        <p className="profile-error-description text-gray-600 mb-4">This could be due to:</p>
        <ul className="profile-error-list list-disc mb-4 pl-8">
          <li>API server not running at http://localhost:5000</li>
          <li>Authentication token expired or missing</li>
          <li>Network connectivity issues</li>
        </ul>
        <button 
          className="profile-retry-button px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="profile-container container mx-auto px-4 py-8">
      <h1 className="profile-title text-3xl font-bold mb-8">Profile</h1>
      
      {/* User Details Card */}
      <Card className="profile-user-card mb-8">
        <CardHeader>
          <CardTitle className="profile-user-title flex items-center">
            <User className="profile-user-icon mr-2" />
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="profile-user-grid grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="profile-user-field">
              <p className="profile-field-label text-gray-500">Username</p>
              <p className="profile-field-value font-medium">{user?.username || 'Not available'}</p>
            </div>
            <div className="profile-user-field">
              <p className="profile-field-label text-gray-500">Email</p>
              <p className="profile-field-value font-medium">{user?.email || 'Not available'}</p>
            </div>
            <div className="profile-user-field">
              <p className="profile-field-label text-gray-500">Phone Number</p>
              <p className="profile-field-value font-medium">{user?.phone_number || 'Not provided'}</p>
            </div>
            <div className="profile-user-field">
              <p className="profile-field-label text-gray-500">Member Since</p>
              <p className="profile-field-value font-medium">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Not available'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Statistics */}
      <Card className="profile-stats-card mb-8">
        <CardHeader>
          <CardTitle className="profile-stats-title flex items-center">
            <CheckCircle className="profile-stats-icon mr-2" />
            Learning Progress Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="profile-completion-container mb-6">
            <div className="profile-completion-header flex justify-between mb-2">
              <span className="profile-completion-label">Overall Completion</span>
              <span className="profile-completion-value">{stats?.completion_percentage || 0}%</span>
            </div>
            <Progress value={stats?.completion_percentage || 0} className="profile-completion-progress h-2" />
          </div>
          
          <div className="profile-stats-grid grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="profile-stat-item profile-stat-subjects bg-blue-50 p-4 rounded-lg">
              <div className="profile-stat-header flex items-center text-blue-600 mb-2">
                <BookOpen className="profile-stat-icon mr-2" size={20} />
                <span className="profile-stat-title font-semibold">Subjects</span>
              </div>
              <p className="profile-stat-value text-2xl font-bold">{stats?.subjects_count || 0}</p>
            </div>
            
            <div className="profile-stat-item profile-stat-chapters bg-green-50 p-4 rounded-lg">
              <div className="profile-stat-header flex items-center text-green-600 mb-2">
                <BookMarked className="profile-stat-icon mr-2" size={20} />
                <span className="profile-stat-title font-semibold">Chapters</span>
              </div>
              <p className="profile-stat-value text-2xl font-bold">{stats?.chapters_count || 0}</p>
            </div>
            
            <div className="profile-stat-item profile-stat-topics bg-purple-50 p-4 rounded-lg">
              <div className="profile-stat-header flex items-center text-purple-600 mb-2">
                <FileText className="profile-stat-icon mr-2" size={20} />
                <span className="profile-stat-title font-semibold"> Lectures</span>
              </div>
              <p className="profile-stat-value text-2xl font-bold">{stats?.topics_count || 0}</p>
            </div>
            
            <div className="profile-stat-item profile-stat-completed bg-amber-50 p-4 rounded-lg">
              <div className="profile-stat-header flex items-center text-amber-600 mb-2">
                <CheckCircle className="profile-stat-icon mr-2" size={20} />
                <span className="profile-stat-title font-semibold">Completed</span>
              </div>
              <p className="profile-stat-value text-2xl font-bold">{stats?.completed_topics || 0}/{stats?.topics_count || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subject Progress */}
      <Card className="profile-subject-card">
        <CardHeader>
          <CardTitle className="profile-subject-title">Subject Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Subject Selector */}
          <div className="profile-subject-selector mb-6">
            <label className="profile-subject-label block text-sm font-medium mb-2">Select Subject</label>
            <select 
              className="profile-subject-dropdown w-full p-2 border border-gray-300 rounded-md"
              onChange={(e) => setSelectedSubject(e.target.value)}
              value={selectedSubject || ''}
              disabled={subjects.length === 0}
            >
              <option value="">Select a subject</option>
              {subjects.map(subject => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            {subjects.length === 0 && (
              <p className="profile-subjects-empty text-sm text-red-500 mt-2">No subjects available. The API might be unavailable.</p>
            )}
          </div>

          {/* Subject Progress Details */}
          {selectedSubject && (
            <div className="profile-subject-details">
              <h3 className="profile-subject-name text-xl font-semibold mb-4">{subjectProgress.subject}</h3>
              
              {subjectProgress.chapters && subjectProgress.chapters.length > 0 ? (
                <div className="profile-chapters-list space-y-4">
                  {subjectProgress.chapters.map((chapter) => (
                    <div key={chapter.chapter_id} className="profile-chapter-item border p-4 rounded-md">
                      <div className="profile-chapter-header flex justify-between mb-2">
                        <span className="profile-chapter-name font-medium">{chapter.chapter_name}</span>
                        <span className="profile-chapter-percentage">{chapter.completion_percentage}%</span>
                      </div>
                      <Progress value={chapter.completion_percentage} className="profile-chapter-progress h-2 mb-2" />
                      <div className="profile-chapter-stats text-sm text-gray-500">
                        {chapter.completed_topics} of {chapter.total_topics} topics completed
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="profile-no-chapters">No chapters found for this subject.</p>
              )}
            </div>
          )}

          {!selectedSubject && (
            <p className="profile-subject-empty text-gray-500">Select a subject to view detailed progress.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;