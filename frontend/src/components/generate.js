import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useParams } from 'react-router-dom';
import { Download, Eye, EyeOff, Trash2, Edit, Save, History, XCircle, RefreshCw, Globe } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';
import './PDFPreview.css';
import { Rings } from 'react-loader-spinner';

const PDFPreview = ({ pdfFileName = 'file.md', heading }) => {
  const { lectureId } = useParams();
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [mdFileContent, setMdFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState(''); // To store original content for canceling edits
  const [messages, setMessages] = useState([
    {
      text: `Hey Teach, I can help you create ${heading.toLowerCase()} for your lecture. What would you like to include?`,
      sender: 'bot',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [notesHistory, setNotesHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(null);
  // Add new state variables for quiz configuration
  const [quizType, setQuizType] = useState('standard');
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  // Add new state variables for translation
  const [showTranslateOptions, setShowTranslateOptions] = useState(false);
  const [translatedContent, setTranslatedContent] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [supportedLanguages, setSupportedLanguages] = useState({});

  // API base URL - could be moved to environment variable
  const API_BASE_URL = 'http://localhost:5000';

  const preprocessContentForPageBreaks = (content) => {
    return content.replace(/---PAGEBREAK---/g, '<div style="page-break-before: always;"></div>');
  };

  const handleDownload = () => {
    const processedContent = preprocessContentForPageBreaks(mdFileContent);
    const htmlContent = marked(processedContent);

    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    Object.assign(element.style, {
      maxWidth: '800px',
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.5',
    });

    const options = {
      margin: 10,
      filename: pdfFileName.replace('.md', '.pdf'),
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, scrollY: 0 },
      jsPDF: { unit: 'pt', orientation: 'portrait' },
    };

    html2pdf().from(element).set(options).save();
  };

  const togglePreview = () => {
    setIsPreviewVisible((prev) => !prev);
  };

  // Get the token from local storage
  const getAuthToken = () => {
    return localStorage.getItem('token');
  };

  // Create common headers for API requests
  const createHeaders = () => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  };

  // Perform a basic connection test to the server
  const testServerConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/`, {
        method: 'GET',
        headers: createHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }
      
      return true;
    } catch (error) {
      console.error('Basic connection test failed:', error);
      return false;
    }
  };

  // Fetch supported languages from the server
  const fetchSupportedLanguages = async () => {
    try {
      // Use the appropriate endpoint based on content type
      const endpoint = heading === 'Generate Notes' 
        ? `${API_BASE_URL}/notes/supported-languages`
        : `${API_BASE_URL}/quiz/supported-languages`;
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: createHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setSupportedLanguages(data.supported_languages);
        }
      }
    } catch (error) {
      console.error('Error fetching supported languages:', error);
    }
  };

  // Translate content to selected language
  const translateContent = async (languageCode) => {
    if (languageCode === currentLanguage) return;
    
    setIsLoading(true);
    
    try {
      // Only proceed if we have content to translate
      if (!mdFileContent) {
        throw new Error("No content to translate");
      }
      
      // Use the appropriate endpoint based on content type
      const endpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/translate/${lectureId}`
        : `${API_BASE_URL}/quiz/translate/${lectureId}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: createHeaders(),
        body: JSON.stringify({
          language: languageCode,
          version_id: selectedVersion // Optional: translate a specific version
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // Store the translated content
          setTranslatedContent(data.translated_content);
          // Update the displayed content
          setMdFileContent(data.translated_content);
          // Update the current language
          setCurrentLanguage(languageCode);
          
          setMessages([
            ...messages,
            { 
              text: `Content translated to ${data.language_name}. You can switch back to the original language anytime.`, 
              sender: 'bot' 
            },
          ]);
        } else {
          throw new Error(data.message || "Translation failed");
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Translation failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Translation error:', error);
      setMessages([
        ...messages,
        { text: `Translation error: ${error.message}`, sender: 'bot' },
      ]);
      // Revert to original content if translation fails
      setMdFileContent(originalContent);
      setCurrentLanguage('en');
    } finally {
      setIsLoading(false);
      setShowTranslateOptions(false);
    }
  };

  // Reset to original language
  const resetToOriginalLanguage = () => {
    if (currentLanguage === 'en') return;
    
    setMdFileContent(originalContent);
    setCurrentLanguage('en');
    setMessages([
      ...messages,
      { text: "Reverted to original language (English).", sender: 'bot' },
    ]);
  };

  const getContent = async () => {
    setIsLoading(true);
    setMessages([...messages, { text: "Attempting to connect to server...", sender: 'bot' }]);
    
    try {
      // Test server connection first
      const isServerConnected = await testServerConnection();
      if (!isServerConnected) {
        throw new Error("Cannot connect to server. Please ensure the backend is running on port 5000.");
      }
      
      // Get the JWT token
      const token = getAuthToken();
      if (!token) {
        throw new Error("Authentication token missing. Please log in again.");
      }
      
      // Determine the endpoint based on the heading
      const endpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/get/${lectureId}`
        : `${API_BASE_URL}/quiz/get/${lectureId}`;
      
      console.log("Making API call to:", endpoint);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: createHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          const content = heading === 'Generate Notes' ? data.notes_content : data.quiz_content;
          setMdFileContent(content);
          setOriginalContent(content);
          setCurrentLanguage(data.language || 'en'); // Get language from response if available
          
          // Set quiz type and difficulty if available (for quizzes)
          if (heading !== 'Generate Notes') {
            setQuizType(data.quiz_type || 'standard');
            setQuizDifficulty(data.difficulty || 'medium');
          }
          
          setMessages([
            ...messages, 
            { text: `I found existing ${heading.toLowerCase()} for this lecture. You can make additional changes by asking me.`, sender: 'bot' }
          ]);
        } else if (data.status === 'not_found') {
          setMessages([
            ...messages,
            { text: `No existing ${heading.toLowerCase()} found for this lecture. What would you like to create?`, sender: 'bot' }
          ]);
        }
      } else if (response.status === 404) {
        // This is expected for new lectures with no content yet
        setMessages([
          ...messages,
          { text: `Let's create some ${heading.toLowerCase()} for this lecture. What would you like to include?`, sender: 'bot' }
        ]);
      } else {
        // Handle other error statuses
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to fetch content. Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching content:', error);
      setMessages([
        ...messages, 
        { text: error.message || "Error connecting to the server. Please check your connection and try again.", sender: 'bot' }
      ]);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  };

  const getNotesHistory = async () => {
    setIsLoading(true);
    
    try {
      const endpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/history/${lectureId}`
        : `${API_BASE_URL}/quiz/history/${lectureId}`;
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: createHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // Map backend data structure to frontend structure
          const historyItems = data.history.map(item => ({
            content: heading === 'Generate Notes' ? item.notes_content : item.quiz_content,
            created_at: item.created_at,
            version_id: item.version_id,
            user_prompt: item.user_prompt || "Manual edit", // Handle missing user prompt
            is_current: item.is_current || false,
            editable: item.editable !== undefined ? item.editable : true,
            quiz_type: item.quiz_type || 'standard',
            difficulty: item.difficulty || 'medium',
            language: item.language || 'en',
            language_name: item.language_name || 'English',
            translated_from: item.translated_from || null
          }));
          setNotesHistory(historyItems);
        } else {
          setNotesHistory([]);
        }
      } else {
        setNotesHistory([]);
      }
    } catch (error) {
      console.error('Error fetching notes history:', error);
      setNotesHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    // Check for empty input
    if (input.trim() === '') return;
    
    const newMessages = [...messages, { text: input, sender: 'user' }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    
    try {
      // Test server connection first
      const isServerConnected = await testServerConnection();
      if (!isServerConnected) {
        throw new Error("Cannot connect to server. Please ensure the backend is running.");
      }
      
      // Authentication check
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      // Sample transcript for now (placeholder)
      const transcript = "Sample transcript data for context.";
      
      // Prepare API data
      const apiData = {
        user_prompt: input,
        transcript: transcript,
        last_notes: mdFileContent || null,
        lecture_id: lectureId
      };
      
      // Add quiz-specific parameters if generating a quiz
      if (heading !== 'Generate Notes') {
        apiData.quiz_type = quizType;
        apiData.difficulty = quizDifficulty;
      }
      
      // Determine correct endpoint based on heading
      const apiEndpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/generate`
        : `${API_BASE_URL}/quiz/generate`;
      
      console.log('Sending request to:', apiEndpoint);
      
      // Make the API request
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: createHeaders(),
        body: JSON.stringify(apiData),
      });
      
      // Log response details for debugging
      console.log("Response status:", response.status);
      
      if (response.ok) {
        // Process successful response
        const data = await response.json();
        // Use the appropriate content key based on the heading
        const content = heading === 'Generate Notes' ? data.notes_content : data.quiz_content;
        
        if (content) {
          setMdFileContent(content);
          setOriginalContent(content);
          setCurrentLanguage('en'); // Reset language to English on new content
          
          // Update quiz type and difficulty if provided (for quizzes)
          if (heading !== 'Generate Notes') {
            setQuizType(data.quiz_type || quizType);
            setQuizDifficulty(data.difficulty || quizDifficulty);
          }
          
          setMessages([
            ...newMessages,
            { text: `Here's your ${heading.toLowerCase()} based on your request. You can make additional changes by asking me.`, sender: 'bot' },
          ]);
        } else {
          setMessages([
            ...newMessages,
            { text: "I processed your request, but received empty content. Please try with more specific instructions.", sender: 'bot' },
          ]);
        }
      } else {
        // Handle error responses
        // Handle error responses
        let errorMessage = `Request failed with status: ${response.status}. `;
        
        try {
          const errorData = await response.json();
          if (errorData.message || errorData.error) {
            errorMessage += errorData.message || errorData.error;
          }
        } catch (e) {
          // If parsing JSON fails, use status code based messages
          if (response.status === 401) {
            errorMessage += "You don't have permission to access this resource.";
          } else if (response.status === 404) {
            errorMessage += "The requested resource couldn't be found.";
          } else if (response.status >= 500) {
            errorMessage += "Server error. Please try again later.";
          } else {
            errorMessage += "Please try again.";
          }
        }
        
        setMessages([
          ...newMessages,
          { text: errorMessage, sender: 'bot' },
        ]);
      }
    } catch (error) {
      // Handle any exceptions
      console.error('Error details:', error);
      
      // Provide more helpful error messages based on error type
      let errorMessage = error.message || 'An error occurred. Please check your connection and try again.';
      
      setMessages([
        ...newMessages,
        { text: errorMessage, sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveEdit = async () => {
    setIsLoading(true);
    
    try {
      const endpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/update/${lectureId}`
        : `${API_BASE_URL}/quiz/update/${lectureId}`;
      
      const contentKey = heading === 'Generate Notes' ? 'notes_content' : 'quiz_content';
      
      // Prepare request body
      const requestBody = {
        [contentKey]: mdFileContent,
        version_id: selectedVersion
      };
      
      // Add quiz-specific parameters if updating a quiz
      if (heading !== 'Generate Notes') {
        requestBody.quiz_type = quizType;
        requestBody.difficulty = quizDifficulty;
      }
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: createHeaders(),
        body: JSON.stringify(requestBody),
      });
      
      if (response.ok) {
        const data = await response.json();
        setOriginalContent(mdFileContent);
        setSelectedVersion(null); // Reset selected version after save
        
        // If we were editing a translated version, update the language info
        if (data.language) {
          setCurrentLanguage(data.language);
        } else {
          setCurrentLanguage('en'); // Default to English
        }
        
        // Update quiz type and difficulty if provided in response (for quizzes)
        if (heading !== 'Generate Notes' && data.quiz_type && data.difficulty) {
          setQuizType(data.quiz_type);
          setQuizDifficulty(data.difficulty);
        }
        
        setMessages([
          ...messages,
          { text: data.message || `Your changes to the ${heading.toLowerCase()} have been saved successfully.`, sender: 'bot' },
        ]);
      } else {
        let errorMessage = `Failed to save changes. Status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message || errorData.error) {
            errorMessage += `. ${errorData.message || errorData.error}`;
          }
        } catch (e) {
          // If parsing JSON fails, use default error message
        }
        
        setMessages([
          ...messages,
          { text: errorMessage, sender: 'bot' },
        ]);
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      setMessages([
        ...messages,
        { text: `Error saving changes: ${error.message}`, sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
      setIsEditing(false);
    }
  };

  const handleDeleteNotes = async () => {
    setIsLoading(true);
    
    try {
      const endpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/delete/${lectureId}`
        : `${API_BASE_URL}/quiz/delete/${lectureId}`;
      
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: createHeaders(),
      });
      
      if (response.ok) {
        setMdFileContent('');
        setOriginalContent('');
        setCurrentLanguage('en'); // Reset to English after deletion
        setMessages([
          ...messages,
          { text: `The ${heading.toLowerCase()} have been deleted successfully.`, sender: 'bot' },
        ]);
      } else {
        let errorMessage = `Failed to delete content. Status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message || errorData.error) {
            errorMessage += `. ${errorData.message || errorData.error}`;
          }
        } catch (e) {
          // If parsing JSON fails, use default error message
        }
        
        setMessages([
          ...messages,
          { text: errorMessage, sender: 'bot' },
        ]);
      }
    } catch (error) {
      console.error('Error deleting content:', error);
      setMessages([
        ...messages,
        { text: `Error deleting content: ${error.message}`, sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
      setConfirmDelete(false);
    }
  };

  // Handle Enter key press to send message
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Cancel editing and revert to original content
  const handleCancelEdit = () => {
    setMdFileContent(originalContent);
    setIsEditing(false);
    setSelectedVersion(null); // Reset selected version
  };

  // Toggle edit mode
  const toggleEdit = () => {
    setIsEditing(!isEditing);
  };

  // Toggle translation options
  const toggleTranslateOptions = () => {
    setShowTranslateOptions(!showTranslateOptions);
  };

  // New function to restore a historical version
  const handleRestoreVersion = async (versionId) => {
    setIsLoading(true);
    
    try {
      const endpoint = heading === 'Generate Notes'
        ? `${API_BASE_URL}/notes/restore/${lectureId}/${versionId}`
        : `${API_BASE_URL}/quiz/restore/${lectureId}/${versionId}`;

      console.log(`Attempting to restore version ${versionId} for lecture ${lectureId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: createHeaders(),
      });
      
      if (response.ok) {
        const data = await response.json();
        const content = heading === 'Generate Notes' ? data.notes_content : data.quiz_content;
        
        setMdFileContent(content);
        setOriginalContent(content);
        setShowHistory(false);
        setCurrentLanguage(data.language || 'en'); // Get language from response if available
        
        // Update quiz type and difficulty if available (for quizzes)
        if (heading !== 'Generate Notes') {
          setQuizType(data.quiz_type || 'standard');
          setQuizDifficulty(data.difficulty || 'medium');
        }
        
        setMessages([
          ...messages,
          { text: `Successfully restored version from history.`, sender: 'bot' },
        ]);
        
        // Refresh content to show the newly restored version
        getContent();
      } else {
        let errorMessage = `Failed to restore version. Status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.message || errorData.error) {
            errorMessage += `. ${errorData.message || errorData.error}`;
          }
        } catch (e) {
          // If parsing JSON fails, use default error message
        }
        
        setMessages([
          ...messages,
          { text: errorMessage, sender: 'bot' },
        ]);
      }
    } catch (error) {
      console.error('Error restoring version:', error);
      setMessages([
        ...messages,
        { text: `Error restoring version: ${error.message}`, sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selection of a historical version - updated to support both edit and append modes
  const handleSelectHistoryVersion = (content, versionId, mode = 'append', versionData = {}) => {
    if (mode === 'append') {
      // Append the selected version's content to current content
      setMdFileContent((prevContent) => prevContent ? `${prevContent}\n\n${content}` : content);
      
      setShowHistory(false);
    } else if (mode === 'edit') {
      // Switch to edit mode with the selected version's content
      setMdFileContent(content);
      setSelectedVersion(versionId);
      
      // Update language if available
      if (versionData.language) {
        setCurrentLanguage(versionData.language);
      }
      
      // Update quiz type and difficulty if provided (for quizzes)
      if (heading !== 'Generate Notes') {
        if (versionData.quiz_type) setQuizType(versionData.quiz_type);
        if (versionData.difficulty) setQuizDifficulty(versionData.difficulty);
      }
      
      setIsEditing(true);
      setShowHistory(false);
    } else if (mode === 'restore') {
      // Call the restore endpoint
      handleRestoreVersion(versionId);
    }
  };

  // Toggle history view
  const toggleHistory = async () => {
    if (!showHistory && notesHistory.length === 0) {
      await getNotesHistory();
    }
    setShowHistory(!showHistory);
  };

  // Toggle delete confirmation
  const toggleDeleteConfirmation = () => {
    setConfirmDelete(!confirmDelete);
  };

  // Handle quiz type change
  const handleQuizTypeChange = (e) => {
    setQuizType(e.target.value);
  };

  // Handle quiz difficulty change
  const handleQuizDifficultyChange = (e) => {
    setQuizDifficulty(e.target.value);
  };

  useEffect(() => {
    getContent();
    // Fetch supported languages for translation - now for both Notes and Quizzes
    fetchSupportedLanguages();
  }, [lectureId]); // Re-fetch when lecture ID changes

  return (
    <div className="pdf-preview-container">
      <div className="max-w-md mx-auto">
        <h1 className="heading">{heading}</h1>
        <Card className="pdf-card">
          <CardHeader className="pdf-card-header">
            <CardTitle className="pdf-card-title">{heading}</CardTitle>
            <div className="icon-buttons">
              {!isEditing ? (
                <>
                  <button
                    onClick={togglePreview}
                    className="icon-button"
                    title={isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
                  >
                    {isPreviewVisible ? <Eye className="icon" /> : <EyeOff className="icon" />}
                  </button>
                  <button 
                    onClick={handleDownload} 
                    className="icon-button" 
                    title="Download PDF"
                    disabled={!mdFileContent}
                  >
                    <Download className="icon" />
                  </button>
                  <button
                    onClick={toggleEdit}
                    className="icon-button"
                    title="Edit Content"
                    disabled={!mdFileContent}
                  >
                    <Edit className="icon" />
                  </button>
                  <button
                    onClick={toggleTranslateOptions}
                    className="icon-button"
                    title="Translate Content"
                    disabled={!mdFileContent}
                  >
                    <Globe className="icon" />
                  </button>
                  <button
                    onClick={toggleHistory}
                    className="icon-button"
                    title="View History"
                  >
                    <History className="icon" />
                  </button>
                  <button
                    onClick={toggleDeleteConfirmation}
                    className="icon-button"
                    title="Delete Content"
                    disabled={!mdFileContent}
                  >
                    <Trash2 className="icon" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="icon-button"
                    title="Save Changes"
                    disabled={isLoading}
                  >
                    <Save className="icon" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="icon-button"
                    title="Cancel Editing"
                  >
                    <XCircle className="icon" />
                  </button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Translation options - now show for both Notes and Quizzes */}
            {showTranslateOptions && (
              <div className="translate-options">
                <h3>Translate to:</h3>
                <div className="language-buttons">
                  {Object.entries(supportedLanguages).map(([code, name]) => (
                    <button
                      key={code}
                      onClick={() => translateContent(code)}
                      className={`language-button ${currentLanguage === code ? 'active' : ''}`}
                      disabled={isLoading || currentLanguage === code}
                    >
                      {name}
                    </button>
                  ))}
                  {currentLanguage !== 'en' && (
                    <button
                      onClick={resetToOriginalLanguage}
                      className="language-button reset"
                      disabled={isLoading}
                    >
                      Reset to English
                    </button>
                  )}
                </div>
                <button
                  onClick={toggleTranslateOptions}
                  className="close-translate-btn"
                >
                  Close
                </button>
                {currentLanguage !== 'en' && (
                  <div className="translated-info">
                    <small>Currently viewing content in {supportedLanguages[currentLanguage] || currentLanguage}</small>
                  </div>
                )}
              </div>
            )}

            {/* Quiz configuration options - Only show for Quiz generation */}
            {heading !== 'Generate Notes' && (
              <div className="quiz-config">
                <div className="quiz-config-row">
                  <div className="quiz-config-item">
                    <label htmlFor="quizType">Quiz Type:</label>
                    <select 
                      id="quizType" 
                      value={quizType} 
                      onChange={handleQuizTypeChange}
                      className="quiz-select"
                      disabled={isLoading || isEditing}
                    >
                      <option value="standard">Standard</option>
                      <option value="multiple-choice">Multiple Choice</option>
                      <option value="true-false">True/False</option>
                      <option value="fill-in-blank">Fill in the Blank</option>
                      <option value="matching">Matching</option>
                    </select>
                  </div>
                  <div className="quiz
                  -config-item">
                    <label htmlFor="quizDifficulty">Difficulty:</label>
                    <select 
                      id="quizDifficulty" 
                      value={quizDifficulty} 
                      onChange={handleQuizDifficultyChange}
                      className="quiz-select"
                      disabled={isLoading || isEditing}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Content display area */}
            {isPreviewVisible && (
              <div className="markdown-content">
                {isLoading ? (
                  <div className="loading-container">
                    <Rings color="#4f46e5" height={80} width={80} />
                    <p>Processing your request...</p>
                  </div>
                ) : isEditing ? (
                  <textarea
                    value={mdFileContent}
                    onChange={(e) => setMdFileContent(e.target.value)}
                    className="markdown-editor"
                    placeholder={`Enter your ${heading.toLowerCase()} content here...`}
                  />
                ) : mdFileContent ? (
                  <ReactMarkdown 
                    children={preprocessContentForPageBreaks(mdFileContent)}
                    rehypePlugins={[rehypeRaw]}
                    remarkPlugins={[remarkGfm]}
                  />
                ) : (
                  <div className="empty-content">
                    <p>No content yet. Use the chat to create {heading.toLowerCase()}.</p>
                  </div>
                )}
              </div>
            )}

            {/* Delete confirmation dialog */}
            {confirmDelete && (
              <div className="delete-confirm">
                <p>Are you sure you want to delete this content?</p>
                <div className="delete-buttons">
                  <button
                    onClick={handleDeleteNotes}
                    className="confirm-delete-btn"
                    disabled={isLoading}
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={toggleDeleteConfirmation}
                    className="cancel-delete-btn"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* History viewer */}
            {showHistory && (
              <div className="history-panel">
                <h3>Version History</h3>
                {isLoading ? (
                  <div className="loading-container small">
                    <Rings color="#4f46e5" height={40} width={40} />
                    <p>Loading history...</p>
                  </div>
                ) : notesHistory.length > 0 ? (
                  <div className="history-list">
                    {notesHistory.map((item, index) => (
                      <div key={item.version_id || index} className="history-item">
                        <div className="history-item-header">
                          <span className="history-date">
                            {new Date(item.created_at).toLocaleString()}
                            {item.is_current && <span className="current-badge">Current</span>}
                          </span>
                          <span className="history-language">
                            {item.language_name || 'English'}
                          </span>
                        </div>
                        <div className="history-prompt">{item.user_prompt}</div>
                        <div className="history-buttons">
                          <button
                            onClick={() => handleSelectHistoryVersion(item.content, item.version_id, 'edit', item)}
                            className="history-btn edit"
                            disabled={!item.editable}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleSelectHistoryVersion(item.content, item.version_id, 'append')}
                            className="history-btn append"
                          >
                            Open
                          </button>
                          {!item.is_current && (
                            <button
                              onClick={() => handleSelectHistoryVersion(item.content, item.version_id, 'restore')}
                              className="history-btn restore"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No history available.</p>
                )}
                <button onClick={toggleHistory} className="close-history-btn">
                  Close
                </button>
              </div>
            )}

            {/* Chat interface */}
            <div className="chat-interface">
              <div className="messages-container">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`message ${message.sender === 'user' ? 'user-message' : 'bot-message'}`}
                  >
                    {message.text}
                  </div>
                ))}
                {isLoading && (
                  <div className="bot-message loading">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
              </div>
              <div className="input-container">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Ask me to create or modify ${heading.toLowerCase()}...`}
                  disabled={isLoading || isEditing}
                  className="chat-input"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim() || isEditing}
                  className="send-button"
                >
                  {isLoading ? <RefreshCw className="icon spinning" /> : 'Send'}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PDFPreview;





